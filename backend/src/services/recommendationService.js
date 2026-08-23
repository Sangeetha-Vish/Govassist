const pool = require("../../config/db");
const scoringService = require("./scoringService");
const { userIdToUUID, explanationToArray } = require("../utils/uuidHelper");

// Ensure user profile exists before saving recommendations
async function ensureUserProfile(userId, profile) {
  if (!userId) return;
  
  try {
    const uuid = userIdToUUID(userId);
    
    // Check if user exists
    const checkResult = await pool.query(
      `SELECT user_id FROM profiles WHERE user_id = $1;`,
      [uuid]
    );
    
    // If user doesn't exist, create a basic profile
    if (checkResult.rows.length === 0) {
      await pool.query(
        `
        INSERT INTO profiles (user_id, age, education, family_income, location, employment_status)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          uuid,
          profile.age || null,
          profile.education || null,
          profile.family_income || null,
          profile.location || null,
          profile.employment_status || null
        ]
      );
    }
  } catch (err) {
    console.warn("Could not ensure user profile exists:", err.message);
  }
}

async function getRecommendations(profile) {
  const {
    user_id,
    age,
    education,
    family_income,
    location,
    employment_status,
    category,
  } = profile;

  // 1. QUERY SCHEMES MATCHING CATEGORY (OR ALL RECOMMENDATION ELIGIBLE SCHEMES IF CATEGORY IS NULL/ALL)
  const query = `
    SELECT
      scheme_id,
      scheme_name,
      category,
      target_group,
      min_age,
      max_age,
      age_rule,
      education_min,
      education_rule,
      max_family_income,
      income_rule,
      location_scope,
      employment_status,
      benefit_type,
      benefit_value,
      benefit_amount,
      benefit_unit,
      benefit_duration,
      documents_required,
      documents_status,
      application_url,
      application_url_status,
      source_url,
      source_page_title,
      source_verified_on,
      status,
      is_recommendation_eligible
    FROM schemes
    WHERE is_recommendation_eligible = true
      AND ($1::text IS NULL OR category = $1)
      AND (
        location_scope = 'pan_india'
        OR (
          location_scope = 'tamil_nadu'
          AND LOWER(COALESCE($2, '')) = 'tamil nadu'
        )
      )
      AND (
        employment_status IS NULL
        OR cardinality(employment_status) = 0
        OR $3::text IS NULL
        OR $3::text = ANY(employment_status)
      )
    ORDER BY scheme_name;
  `;

  let result = await pool.query(query, [category || null, location, employment_status || null]);
  let candidateSchemes = result.rows;

  // Fallback: If no candidate schemes found for explicit category, try fetching all recommendation eligible schemes
  if (candidateSchemes.length === 0 && category) {
    const fallbackResult = await pool.query(query, [null, location, employment_status || null]);
    candidateSchemes = fallbackResult.rows;
  }

  // 2. FETCH VERIFIED USER DOCUMENTS FOR READINESS SCORING & PERSONALIZATION
  let verifiedDocs = [];
  if (user_id) {
    try {
      const uuid = userIdToUUID(user_id);
      const docsRes = await pool.query(
        `SELECT document_type, extracted_data FROM documents WHERE user_id = $1 AND verification_status = 'verified'`,
        [uuid]
      );
      verifiedDocs = docsRes.rows;
    } catch (e) {
      console.warn("Could not fetch user verified documents for recommendations:", e.message);
    }
  }

  // 3. TWO-STAGE ELIGIBILITY EVALUATION & WEIGHTED SCORING WITH VERIFIED DOC BOOST
  const evaluatedSchemes = candidateSchemes.map((scheme) => {
    const evalResult = scoringService.evaluateSchemeEligibilityAndScore(profile, scheme, verifiedDocs);

    return {
      ...scheme,
      is_eligible: evalResult.is_eligible,
      fit_score: evalResult.fit_score,
      application_url: evalResult.official_application_url, // Return null if not working/valid
      matched_verified_documents: evalResult.matched_verified_documents || [],
      explanation: evalResult.explanation,
    };
  });

  // Filter for only hard-eligible schemes or include schemes with fit_score > 0
  const eligibleRecommendations = evaluatedSchemes.filter((s) => s.is_eligible);

  // 3. SORT BY FIT SCORE (DESCENDING)
  eligibleRecommendations.sort((a, b) => b.fit_score - a.fit_score);

  // 4. LIMIT TO TOP 10 RECOMMENDATIONS
  const topRecommendations = eligibleRecommendations.slice(0, 10);

  // 5. ASSIGN RANKS
  topRecommendations.forEach((scheme, index) => {
    scheme.rank = index + 1;
  });

  // 6. SAVE RECOMMENDATIONS IF USER_ID IS PRESENT
  if (user_id && topRecommendations.length > 0) {
    try {
      // Ensure user profile exists
      await ensureUserProfile(user_id, profile);
      
      const uuid = userIdToUUID(user_id);
      
      await pool.query(`DELETE FROM recommendations WHERE user_id = $1;`, [uuid]);

      for (const rec of topRecommendations) {
        // Convert explanation object to array format for text[] column
        const explanationArray = explanationToArray(rec.explanation);
        
        await pool.query(
          `
          INSERT INTO recommendations (user_id, scheme_id, fit_score, rank, explanation)
          VALUES ($1, $2, $3::int, $4::int, $5)
          ON CONFLICT (user_id, scheme_id)
          DO UPDATE SET
            fit_score = EXCLUDED.fit_score,
            rank = EXCLUDED.rank,
            explanation = EXCLUDED.explanation;
          `,
          [uuid, rec.scheme_id, rec.fit_score, rec.rank, explanationArray]
        );
      }
    } catch (saveErr) {
      console.warn("Could not save recommendations to DB for user_id (skipping persistence):", saveErr.message);
    }
  }

  return topRecommendations;
}

module.exports = {
  getRecommendations,
};