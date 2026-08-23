/*
 * GOVASSIST - SCORING & EXPLANATION SERVICE (Phase 1 Production-Ready)
 */

function normalizeEducation(value) {
  if (!value) return null;
  const text = String(value).toLowerCase().trim();

  if (text.includes("phd") || text.includes("doctorate")) return 7;
  if (
    text.includes("postgraduate") ||
    text.includes("post graduate") ||
    text.includes("master") ||
    text.includes("m.e") ||
    text.includes("m.tech") ||
    text.includes("m.sc") ||
    text.includes("m.a")
  )
    return 6;
  if (
    text.includes("graduate") ||
    text.includes("b.tech") ||
    text.includes("b.e") ||
    text.includes("b.sc") ||
    text.includes("b.a") ||
    text.includes("b.com") ||
    text.includes("bachelor")
  )
    return 5;
  if (text.includes("diploma")) return 4;
  if (text.includes("12th") || text.includes("12 th") || text.includes("higher secondary") || text.includes("iti")) return 3;
  if (text.includes("10th") || text.includes("10 th") || text.includes("secondary")) return 2;
  if (text.includes("below 10th") || text.includes("below tenth")) return 1;

  return null;
}

function ageEvaluation(age, scheme) {
  const minAge = scheme.min_age !== null && scheme.min_age !== undefined ? Number(scheme.min_age) : null;
  const maxAge = scheme.max_age !== null && scheme.max_age !== undefined ? Number(scheme.max_age) : null;

  if (minAge === null && maxAge === null) {
    return { isHardEligible: true, score: 1, status: "NO_REQUIREMENT", detail: "No age criteria specified for this scheme." };
  }

  if (age === null || age === undefined) {
    // If scheme has mandatory age bounds, missing age fails hard eligibility
    return {
      isHardEligible: false,
      score: 0,
      status: "MISSING_REQUIRED_INFO",
      detail: `Age is required for this scheme (${minAge ? `min: ${minAge}` : ''}${minAge && maxAge ? ', ' : ''}${maxAge ? `max: ${maxAge}` : ''}).`,
    };
  }

  const userAge = Number(age);
  if (Number.isNaN(userAge)) {
    return { isHardEligible: false, score: 0, status: "INVALID_DATA", detail: "Provided age is invalid." };
  }

  if (minAge !== null && userAge < minAge) {
    return { isHardEligible: false, score: 0, status: "INELIGIBLE", detail: `User age (${userAge}) is below the minimum age of ${minAge}.` };
  }

  if (maxAge !== null && userAge > maxAge) {
    return { isHardEligible: false, score: 0, status: "INELIGIBLE", detail: `User age (${userAge}) exceeds the maximum age of ${maxAge}.` };
  }

  return { isHardEligible: true, score: 1, status: "QUALIFIED", detail: "Age criteria satisfied." };
}

function educationEvaluation(userEducation, schemeEducation) {
  if (!schemeEducation) {
    return { isHardEligible: true, score: 1, status: "NO_REQUIREMENT", detail: "No minimum education specified." };
  }

  const requiredLevel = normalizeEducation(schemeEducation);
  if (requiredLevel === null) {
    return { isHardEligible: true, score: 1, status: "QUALIFIED", detail: `Education requirement (${schemeEducation}) noted.` };
  }

  if (!userEducation) {
    return {
      isHardEligible: false,
      score: 0,
      status: "MISSING_REQUIRED_INFO",
      detail: `Education qualification (${schemeEducation}) is required for this scheme.`,
    };
  }

  const userLevel = normalizeEducation(userEducation);
  if (userLevel === null) {
    return { isHardEligible: true, score: 0.5, status: "NEEDS_VERIFICATION", detail: `User education '${userEducation}' requires verification against scheme requirement '${schemeEducation}'.` };
  }

  if (userLevel >= requiredLevel) {
    return { isHardEligible: true, score: 1, status: "QUALIFIED", detail: `Education requirement (${schemeEducation}) satisfied.` };
  }

  return { isHardEligible: false, score: 0, status: "INELIGIBLE", detail: `Education level is below the required minimum (${schemeEducation}).` };
}

function incomeEvaluation(income, scheme) {
  const maxIncome = scheme.max_family_income !== null && scheme.max_family_income !== undefined ? Number(scheme.max_family_income) : null;

  if (maxIncome === null) {
    return { isHardEligible: true, score: 1, status: "NO_REQUIREMENT", detail: "No family income cap for this scheme." };
  }

  if (income === null || income === undefined) {
    return {
      isHardEligible: false,
      score: 0,
      status: "MISSING_REQUIRED_INFO",
      detail: `Family income is required (must be ≤ ₹${maxIncome.toLocaleString("en-IN")}).`,
    };
  }

  const userIncome = Number(income);
  if (Number.isNaN(userIncome)) {
    return { isHardEligible: false, score: 0, status: "INVALID_DATA", detail: "Provided family income is invalid." };
  }

  if (userIncome <= maxIncome) {
    return { isHardEligible: true, score: 1, status: "QUALIFIED", detail: `Family income (₹${userIncome.toLocaleString("en-IN")}) is within the limit (₹${maxIncome.toLocaleString("en-IN")}).` };
  }

  return { isHardEligible: false, score: 0, status: "INELIGIBLE", detail: `Family income (₹${userIncome.toLocaleString("en-IN")}) exceeds the scheme limit of ₹${maxIncome.toLocaleString("en-IN")}.` };
}

function getCategoryWeights(category) {
  switch (category) {
    case "student":
      return { age: 0.30, education: 0.40, income: 0.30 };
    case "graduate":
      return { age: 0.25, education: 0.40, income: 0.35 };
    case "startup":
      return { age: 0.30, education: 0.40, income: 0.30 };
    default:
      return { age: 0.33, education: 0.34, income: 0.33 };
  }
}

const DOC_TYPE_TO_SCHEME_MAP = {
  pan: ["pan", "pan card", "income tax"],
  aadhaar: ["aadhaar", "aadhar", "aadhaar card", "identity proof", "id proof"],
  voter_id: ["voter id", "epic", "voter card", "identity proof", "id proof"],
  income_certificate: ["income certificate", "income proof", "salary certificate", "income"],
  marksheet_10: ["10th marksheet", "sslc", "10th certificate", "matriculation", "10th mark sheet", "10th"],
  marksheet_12: ["12th marksheet", "hsc", "12th certificate", "+2 marksheet", "higher secondary", "12th mark sheet", "12th"],
  diploma: ["diploma certificate", "diploma", "polytechnic certificate"],
  degree: ["degree certificate", "degree", "graduation certificate", "bachelor degree", "master degree", "degree/provisional", "graduation"]
};

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

function evaluateSchemeEligibilityAndScore(profile, scheme, verifiedDocs = []) {
  const ageEval = ageEvaluation(profile.age, scheme);
  const eduEval = educationEvaluation(profile.education, scheme.education_min);
  const incEval = incomeEvaluation(profile.family_income, scheme);

  const isHardEligible = ageEval.isHardEligible && eduEval.isHardEligible && incEval.isHardEligible;

  const why_qualified = [];
  const why_ineligible = [];
  const missing_info = [];

  [ageEval, eduEval, incEval].forEach((evalItem) => {
    if (evalItem.status === "QUALIFIED") {
      why_qualified.push(evalItem.detail);
    } else if (evalItem.status === "INELIGIBLE") {
      why_ineligible.push(evalItem.detail);
    } else if (evalItem.status === "MISSING_REQUIRED_INFO") {
      missing_info.push(evalItem.detail);
    }
  });

  // ─── VERIFIED DOCUMENT MATCHING & READINESS BOOST ───
  let docBonus = 0;
  const matchedVerifiedDocs = [];
  const requiredDocsText = Array.isArray(scheme.documents_required)
    ? scheme.documents_required.join(" ").toLowerCase()
    : (typeof scheme.documents_required === "string" ? scheme.documents_required.toLowerCase() : "");

  if (verifiedDocs && verifiedDocs.length > 0 && requiredDocsText) {
    for (const vDoc of verifiedDocs) {
      const aliases = DOC_TYPE_TO_SCHEME_MAP[vDoc.document_type] || [vDoc.document_type];
      const isMatched = aliases.some(alias => requiredDocsText.includes(alias));
      if (isMatched) {
        const prettyName = DOC_TYPE_PRETTY_LABELS[vDoc.document_type] || vDoc.document_type;
        matchedVerifiedDocs.push(prettyName);
        docBonus += 5; // +5% readiness boost per matched verified document
        why_qualified.push(`Verified ${prettyName} attached and ready for application.`);
      }
    }
  }

  const weights = getCategoryWeights(profile.category);
  const weightedScore =
    ageEval.score * weights.age +
    eduEval.score * weights.education +
    incEval.score * weights.income;

  let fit_score = isHardEligible ? Math.min(100, Math.round(weightedScore * 100) + docBonus) : 0;

  // Clean document array and application URL (null if missing/invalid URL, no fake placeholders)
  const official_application_url =
    scheme.application_url && scheme.application_url_status === "working"
      ? scheme.application_url
      : null;

  return {
    is_eligible: isHardEligible,
    fit_score,
    official_application_url,
    matched_verified_documents: matchedVerifiedDocs,
    explanation: {
      why_qualified,
      why_ineligible,
      missing_info,
    },
  };
}

module.exports = {
  normalizeEducation,
  ageEvaluation,
  educationEvaluation,
  incomeEvaluation,
  evaluateSchemeEligibilityAndScore,
};