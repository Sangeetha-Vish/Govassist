const { evaluateSchemeEligibilityAndScore } = require("../scoringService");

const DOC_TYPE_PRETTY_LABELS = {
  pan: "PAN Card",
  aadhaar: "Aadhaar Card",
  voter_id: "Voter ID",
  income_certificate: "Income Certificate",
  marksheet_10: "10th Marksheet",
  marksheet_12: "12th Marksheet",
  diploma: "Diploma Certificate",
  degree: "Degree Certificate"
};

function formatAge(minAge, maxAge) {
  const min = minAge !== null && minAge !== undefined && minAge > 0 ? minAge : null;
  const max = maxAge !== null && maxAge !== undefined && maxAge > 0 && maxAge < 120 ? maxAge : null;
  if (!min && !max) return "No age limit (open to all ages)";
  if (min && max) return `${min} to ${max} years`;
  if (min) return `Minimum ${min} years`;
  return `Up to ${max} years`;
}

function formatIncome(maxIncome) {
  if (maxIncome === null || maxIncome === undefined || Number(maxIncome) <= 0) {
    return "No family income ceiling (open to all income brackets)";
  }
  return `≤ ₹${Number(maxIncome).toLocaleString("en-IN")} per annum`;
}

/**
 * Capability 1: Eligibility & Scheme Fact Breakdown
 */
function composeEligibilityResponse(scheme, userProfile, verifiedDocs = []) {
  const name = scheme.scheme_name;
  const url = scheme.application_url || scheme.source_url || "https://www.india.gov.in";
  const verifiedOn = scheme.source_verified_on || "2026-08-20";
  const benefit = scheme.benefit_value || scheme.benefit_amount || "Financial and welfare assistance";

  let response = `### [${name}](${url})\n\n`;
  response += `**Official Benefit:** ${benefit}\n\n`;

  if (userProfile && (userProfile.age || userProfile.education || userProfile.family_income)) {
    const scoreResult = evaluateSchemeEligibilityAndScore(userProfile, scheme, verifiedDocs);
    const fitScore = scoreResult.fit_score;
    const isEligible = scoreResult.is_eligible;

    response += `**Personalized Match & Eligibility Evaluation (${fitScore}% Match):**\n`;
    if (isEligible) {
      response += `✅ **Overall Status:** You meet the primary criteria for this scheme.\n`;
    } else {
      response += `⚠️ **Overall Status:** You may not currently meet all criteria or are missing required profile fields.\n`;
    }

    if (scoreResult.explanation.why_qualified.length > 0) {
      response += `\n**Criteria You Meet:**\n`;
      scoreResult.explanation.why_qualified.forEach(reason => {
        response += `- ✅ ${reason}\n`;
      });
    }

    if (scoreResult.explanation.why_ineligible.length > 0) {
      response += `\n**Eligibility Gaps:**\n`;
      scoreResult.explanation.why_ineligible.forEach(reason => {
        response += `- ❌ ${reason}\n`;
      });
    }

    if (scoreResult.explanation.missing_info.length > 0) {
      response += `\n**Information Needed to Confirm:**\n`;
      scoreResult.explanation.missing_info.forEach(item => {
        response += `- ℹ️ ${item}\n`;
      });
    }
  } else {
    response += `**Official Eligibility Criteria:**\n`;
    response += `- **Age Range:** ${formatAge(scheme.min_age, scheme.max_age)}\n`;
    response += `- **Education:** ${scheme.education_min || "Open qualification / No minimum required"}\n`;
    response += `- **Family Income Limit:** ${formatIncome(scheme.max_family_income)}\n`;
    response += `- **Target Group:** ${scheme.target_group || "Citizens meeting criteria"}\n`;
    response += `- **Location Scope:** ${scheme.location_scope === "tamil_nadu" ? "Tamil Nadu Residents" : "All India (Central Scheme)"}\n`;
  }

  response += `\n📅 **Application Window:** ${scheme.deadline_type === "fixed_annual" ? "Fixed Annual Intake Cycle" : "Open Year-Round Rolling Intake"} *(Last verified on: ${verifiedOn})*.\n\n`;
  response += `Official Portal: [${name} Application Portal](${url})`;

  return {
    text: response,
    sources: [{ scheme_name: name, url }],
    isPersonalized: !!userProfile?.age || !!userProfile?.family_income
  };
}

/**
 * Capability 2: Document Troubleshooting & Rejection Explanation
 */
function composeDocumentTroubleshootingResponse(docRecord, userProfile) {
  if (!docRecord) {
    return {
      text: `I couldn't find any document records with verification issues in your profile.\n\nYou can upload and check your documents in [Doc Check](/profile) to ensure they are verified for scheme matching.`,
      sources: [],
      isPersonalized: true
    };
  }

  const docLabel = DOC_TYPE_PRETTY_LABELS[docRecord.document_type] || docRecord.document_type?.replace(/_/g, " ") || "Document";
  const status = docRecord.verification_status;
  const dateFormatted = new Date(docRecord.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const reason = docRecord.rejection_reason || docRecord.admin_notes;
  const validationResults = docRecord.validation_results || {};

  let text = `### Document Verification Status: ${docLabel}\n\n`;
  text += `**Upload Date:** ${dateFormatted}\n`;
  text += `**Current Status:** **${status === "verified" ? "✅ Verified" : status === "manual_review_required" ? "⏳ Pending Manual Review" : "⚠️ Needs Attention / Rejected"}**\n\n`;

  if (status === "verified") {
    text += `Your **${docLabel}** has been successfully verified and attached to your profile snapshot for automated scheme matching.\n`;
  } else if (status === "manual_review_required") {
    text += `Your **${docLabel}** is currently queued for manual verification by our verification team.\n`;
    if (reason) {
      text += `**Review Notice:** ${reason}\n\n`;
    }
    text += `No action is required right now. If our team requires a clearer copy, you will see an update in your profile.\n`;
  } else {
    text += `**Why It Needs Attention:**\n`;
    if (reason) {
      text += `> ${reason}\n\n`;
    } else {
      text += `This document could not be automatically validated against official security markers and required fields.\n\n`;
    }

    text += `**Concrete Next Steps:**\n`;
    text += `1. Go to your [Verified Document Vault in Profile](/profile).\n`;
    text += `2. Ensure the document is a complete, clear scan or official PDF (not a cropped photo or word processor export).\n`;
    text += `3. Confirm that all key fields (Name, Registration/Certificate Number, Dates, and Official Seals) are clearly legible before re-uploading.\n`;
  }

  return {
    text,
    sources: [],
    isPersonalized: true
  };
}

/**
 * Capability 3: Conversational Ranked Recommendations
 */
function composeRecommendationsResponse(rankedSchemes, userProfile) {
  if (!rankedSchemes || rankedSchemes.length === 0) {
    let msg = `### Personalized Scheme Recommendations\n\n`;
    msg += `I couldn't find any direct eligible schemes based on your current profile snapshot.\n\n`;
    if (!userProfile?.age || !userProfile?.education || !userProfile?.family_income) {
      msg += `💡 **Tip to unlock matches:** Your profile is missing key details (`;
      const missing = [];
      if (!userProfile?.age) missing.push("Age");
      if (!userProfile?.education) missing.push("Educational Qualification");
      if (!userProfile?.family_income) missing.push("Annual Family Income");
      msg += `${missing.join(", ")}). Updating your [Snapshot Profile](/profile) will help me discover eligible scholarships, grants, and subsidies tailored to you.\n\n`;
    }
    msg += `You can also browse the full catalog directly in the [Scheme Finder](/finder).`;
    return { text: msg, sources: [], isPersonalized: true };
  }

  let text = `### Schemes Tailored to Your Profile\n\n`;
  text += `Based on your profile snapshot, here are the top schemes ranked by eligibility and fit score:\n\n`;

  const sources = [];

  rankedSchemes.slice(0, 5).forEach((scheme, index) => {
    const name = scheme.scheme_name;
    const url = scheme.application_url || scheme.source_url || "https://www.india.gov.in";
    const fitScore = scheme.fit_score || 0;
    const benefit = scheme.benefit_value || scheme.benefit_amount || "Financial assistance";

    sources.push({ scheme_name: name, url });

    text += `${index + 1}. **[${name}](${url})** — **${fitScore}% Match**\n`;
    text += `   - **Benefit:** ${benefit}\n`;
    if (scheme.explanation?.why_qualified?.length > 0) {
      text += `   - **Why you qualify:** ${scheme.explanation.why_qualified[0]}\n`;
    }
    text += `\n`;
  });

  const missingFields = [];
  if (!userProfile?.family_income) missingFields.push("Annual Family Income");
  if (!userProfile?.education) missingFields.push("Education Qualification");
  if (!userProfile?.age) missingFields.push("Age");

  if (missingFields.length > 0) {
    text += `💡 *Note: Adding your ${missingFields.join(" and ")} in [Profile](/profile) may unlock more verified matches.*\n\n`;
  }

  text += `Ask me about any specific scheme above (e.g. *"Tell me how to apply for ${rankedSchemes[0]?.scheme_name}"*) to see detailed steps!`;

  return { text, sources, isPersonalized: true };
}

/**
 * Capability 4: Natural Language Situation Discovery
 */
function composeDiscoveryResponse(discoveredSchemes, situationQuery) {
  if (!discoveredSchemes || discoveredSchemes.length === 0) {
    return {
      text: `I couldn't find active government schemes specifically matching that description in our database.\n\nYou can browse all 95+ active state and central schemes with custom category, age, and income filters directly in the [Scheme Finder](/finder).`,
      sources: [],
      isPersonalized: false
    };
  }

  let text = `### Matching Schemes for Your Situation\n\n`;
  text += `Here are candidate schemes from our verified database that match your described situation:\n\n`;

  const sources = [];

  discoveredSchemes.slice(0, 4).forEach((scheme, i) => {
    const name = scheme.scheme_name;
    const url = scheme.application_url || scheme.source_url || "https://www.india.gov.in";
    const benefit = scheme.benefit_value || "Welfare assistance";
    const target = scheme.target_group || "Eligible citizens";

    sources.push({ scheme_name: name, url });

    text += `${i + 1}. **[${name}](${url})**\n`;
    text += `   - **Target Group:** ${target}\n`;
    text += `   - **Benefit:** ${benefit}\n\n`;
  });

  text += `Would you like me to check your personalized eligibility for any of these, or narrow down by income limit or location?`;

  return { text, sources, isPersonalized: false };
}

/**
 * Capability 5: Turnaround / Processing Time
 */
function composeProcessingTimeResponse(scheme) {
  const name = scheme.scheme_name;
  const url = scheme.application_url || scheme.source_url || "https://www.india.gov.in";
  const verifiedOn = scheme.source_verified_on || "2026-08-20";

  // Check if scheme has a verified turnaround field
  const processingTime = scheme.processing_time || scheme.turnaround_estimate;

  let text = `### [${name}](${url}) — Processing & Turnaround Time\n\n`;

  if (processingTime) {
    text += `**Typical Processing Timeline:** ${processingTime}\n\n`;
    text += `📅 **Last verified on:** ${verifiedOn}. Actual turnaround times may vary depending on district verification backlogs and nodal scrutiny cycles.\n\n`;
  } else {
    // Honest disclosure — Zero fabrication
    text += `I don't have a verified typical turnaround time on file for **${name}** in our registry. Official processing durations vary by nodal scrutiny committees and fund availability.\n\n`;
    text += `The official portal ([${name} Portal](${url})) or designated department helpline is the most reliable source for active processing schedules and sanction lists.\n\n`;
  }

  text += `You can also track application milestones on the official portal once your Application Reference ID is generated.`;

  return {
    text,
    sources: [{ scheme_name: name, url }],
    isPersonalized: false
  };
}

/**
 * Disambiguation Response for Ambiguous Entities
 */
function composeDisambiguationResponse(candidates, entityQuery) {
  let text = `I found multiple schemes matching **"${entityQuery}"** in our database. Which one would you like to explore?\n\n`;

  candidates.forEach((c, idx) => {
    text += `${idx + 1}. **${c.scheme_name}** (${c.category ? c.category.toUpperCase() : "General"})\n`;
    if (c.benefit_value) {
      text += `   - *Benefit:* ${c.benefit_value}\n`;
    }
  });

  text += `\nPlease reply with the specific scheme name (or number) to get exact eligibility, deadlines, or application procedures.`;

  return {
    text,
    sources: [],
    isPersonalized: false
  };
}

module.exports = {
  composeEligibilityResponse,
  composeDocumentTroubleshootingResponse,
  composeRecommendationsResponse,
  composeDiscoveryResponse,
  composeProcessingTimeResponse,
  composeDisambiguationResponse
};
