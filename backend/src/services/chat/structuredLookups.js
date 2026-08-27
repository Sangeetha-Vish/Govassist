const pool = require("../../../config/db");
const { getRecommendations } = require("../recommendationService");
const { evaluateSchemeEligibilityAndScore } = require("../scoringService");

// Comprehensive Scheme Aliases Map (Acronyms to Full Names/IDs)
const SCHEME_ALIASES = {
  aabcs: "AABCS - Annal Ambedkar Business Champions Scheme (Tamil Nadu)",
  pmfme: "PMFME - PM Formalisation of Micro Food Processing Enterprises Scheme",
  pmegp: "PMEGP - Prime Minister's Employment Generation Programme",
  mudra: "Pradhan Mantri MUDRA Yojana (PMMY)",
  pragati: "AICTE Pragati Scholarship for Girl Students",
  saksham: "AICTE Saksham Scholarship Scheme for Specially-Abled Students",
  swanath: "AICTE Swanath Scholarship Scheme",
  uyegp: "UYEGP - Unemployed Youth Employment Generation Programme (Tamil Nadu)",
  needs: "NEEDS - New Entrepreneur-cum-Enterprise Development Scheme (Tamil Nadu)",
  "naan mudhalvan": "Naan Mudhalvan Scheme (Tamil Nadu)",
  "pudhumai penn": "Moovalur Ramamirtham Ammaiyar Higher Education Assurance Scheme (Pudhumai Penn)",
  "cm fellowship": "Chief Minister's Fellowship Programme (Tamil Nadu)",
  "free laptop": "Free Laptop Scheme for Students (Tamil Nadu)",
  tiic: "TIIC - Micro / Small Enterprises Term Loan Scheme (Tamil Nadu)",
  "central sector scholarship": "Central Sector Scheme of Scholarship for College and University Students",
  nsp: "Central Sector Scheme of Scholarship for College and University Students",
};

/**
 * 1. Exact & Alias Database Lookup for Scheme Entity
 */
async function getSchemeByNameOrAlias(queryOrEntity) {
  if (!queryOrEntity || typeof queryOrEntity !== "string") return { scheme: null, isAmbiguous: false };
  const raw = queryOrEntity.trim();
  const lower = raw.toLowerCase();

  // Strip prefix/suffix question noise
  const cleanEntity = lower
    .replace(/^(what is|tell me about|how to apply for|when is the deadline for|deadline for|how does|criteria for|details of|status of|help with|info on|overview of)\s+/i, "")
    .replace(/\?+$/, "")
    .trim();

  // Check alias dictionary
  for (const [alias, canonicalName] of Object.entries(SCHEME_ALIASES)) {
    if (cleanEntity === alias || cleanEntity.includes(alias)) {
      try {
        const res = await pool.query(
          "SELECT * FROM schemes WHERE LOWER(scheme_name) LIKE $1 OR LOWER(scheme_id) LIKE $1 LIMIT 1",
          [`%${canonicalName.toLowerCase()}%`]
        );
        if (res.rows.length > 0) {
          return { scheme: res.rows[0], isAmbiguous: false };
        }
      } catch (err) {
        console.warn("DB Scheme alias lookup error:", err.message);
      }
    }
  }

  // Exact or partial name match in PostgreSQL
  try {
    const res = await pool.query(
      `SELECT * FROM schemes 
       WHERE LOWER(scheme_name) = $1 OR LOWER(scheme_id) = $1
       LIMIT 1`,
      [cleanEntity]
    );

    if (res.rows.length > 0) {
      return { scheme: res.rows[0], isAmbiguous: false };
    }

    // Check for ambiguous group matches (e.g. "aicte" or "scholarship")
    const searchTerms = cleanEntity.split(/\s+/).filter(t => t.length > 2 && !["scheme", "apply", "what", "deadline", "government"].includes(t));
    if (searchTerms.length > 0) {
      const condition = searchTerms.map((_, i) => `LOWER(scheme_name) LIKE $${i + 1}`).join(" AND ");
      const params = searchTerms.map(t => `%${t}%`);
      const groupRes = await pool.query(
        `SELECT scheme_id, scheme_name, category, benefit_value FROM schemes WHERE ${condition} LIMIT 5`,
        params
      );

      if (groupRes.rows.length > 1) {
        return {
          scheme: null,
          isAmbiguous: true,
          candidates: groupRes.rows
        };
      } else if (groupRes.rows.length === 1) {
        return { scheme: groupRes.rows[0], isAmbiguous: false };
      }
    }
  } catch (err) {
    console.warn("DB Scheme lookup error:", err.message);
  }

  return { scheme: null, isAmbiguous: false };
}

/**
 * 2. User Document Verification Status & Rejection Reason Lookup
 */
async function getUserDocumentRecord(userId, docQuery = "") {
  if (!userId) return null;

  try {
    const query = `
      SELECT id, document_type, file_path, verification_status, extracted_data, validation_results, rejection_reason, admin_notes, created_at
      FROM documents
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [userId]);
    const userDocs = result.rows;

    if (userDocs.length === 0) return null;

    const lowerQuery = (docQuery || "").toLowerCase();

    // Map keywords to document_type
    const typeMapping = {
      marksheet: ["marksheet_12", "marksheet_10", "marksheet"],
      "12th": ["marksheet_12"],
      "10th": ["marksheet_10"],
      income: ["income_certificate", "income"],
      pan: ["pan"],
      aadhaar: ["aadhaar"],
      voter: ["voter_id"],
      diploma: ["diploma"],
      degree: ["degree"]
    };

    let targetDocType = null;
    for (const [kw, types] of Object.entries(typeMapping)) {
      if (lowerQuery.includes(kw)) {
        targetDocType = types;
        break;
      }
    }

    if (targetDocType) {
      const match = userDocs.find(d => targetDocType.includes(d.document_type));
      if (match) return match;
    }

    // Return the latest document that is NOT verified (i.e. rejected, review required, pending)
    const issueDoc = userDocs.find(d => d.verification_status !== "verified");
    if (issueDoc) return issueDoc;

    return userDocs[0];
  } catch (err) {
    console.warn("DB User document lookup error:", err.message);
    return null;
  }
}

/**
 * 3. Live Ranked Personalized Recommendations
 */
async function getLiveUserRecommendations(profile) {
  if (!profile) return [];
  try {
    return await getRecommendations(profile);
  } catch (err) {
    console.warn("Live recommendation error:", err.message);
    return [];
  }
}

/**
 * 4. Natural-Language Situation Discovery via Database Criteria
 */
async function discoverSchemesByCriteria(descriptionText, userProfile = null) {
  const text = (descriptionText || "").toLowerCase();

  let category = null;
  if (text.includes("farmer") || text.includes("agriculture") || text.includes("crop") || text.includes("tractor") || text.includes("farm")) {
    category = "farmer";
  } else if (text.includes("student") || text.includes("scholarship") || text.includes("college") || text.includes("school") || text.includes("degree") || text.includes("diploma")) {
    category = "student";
  } else if (text.includes("startup") || text.includes("entrepreneur") || text.includes("business") || text.includes("loan") || text.includes("subsidy") || text.includes("machinery")) {
    category = "startup";
  } else if (text.includes("women") || text.includes("woman") || text.includes("girl") || text.includes("female") || text.includes("mother")) {
    category = "women";
  } else if (text.includes("differently abled") || text.includes("disabled") || text.includes("handicap") || text.includes("pwd")) {
    category = "differently_abled";
  }

  const isTamilNadu = text.includes("tamil nadu") || text.includes("tn") || text.includes("chennai") || (userProfile?.location && userProfile.location.toLowerCase().includes("tamil nadu"));

  let query = `
    SELECT scheme_id, scheme_name, category, target_group, benefit_value, location_scope, min_age, max_age, max_family_income, application_url, source_url
    FROM schemes
    WHERE status = 'active'
  `;
  const params = [];

  if (category) {
    params.push(category);
    query += ` AND category = $${params.length}`;
  }

  if (isTamilNadu) {
    params.push("tamil_nadu", "pan_india");
    query += ` AND location_scope IN ($${params.length - 1}, $${params.length})`;
  }

  query += ` ORDER BY scheme_name LIMIT 6;`;

  try {
    const res = await pool.query(query, params);
    return res.rows;
  } catch (err) {
    console.warn("DB Discovery query error:", err.message);
    return [];
  }
}

module.exports = {
  getSchemeByNameOrAlias,
  getUserDocumentRecord,
  getLiveUserRecommendations,
  discoverSchemesByCriteria
};
