const pool = require("../../config/db");
const { ValidationError, NotFoundError } = require("../middleware/errorHandler");

async function getAllSchemes(options = {}) {
  const { status, category, search } = options;
  let query = `
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
      verification_comments,
      status,
      review_status,
      is_recommendation_eligible,
      created_at,
      updated_at
    FROM schemes
    WHERE 1=1
  `;

  const values = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND status = $${paramIndex++}`;
    values.push(status);
  }

  if (category) {
    query += ` AND category = $${paramIndex++}`;
    values.push(category);
  }

  if (search) {
    query += ` AND (LOWER(scheme_name) LIKE $${paramIndex} OR LOWER(scheme_id) LIKE $${paramIndex})`;
    values.push(`%${search.toLowerCase().trim()}%`);
    paramIndex++;
  }

  query += ` ORDER BY scheme_name;`;

  const result = await pool.query(query, values);
  return result.rows;
}

async function getSchemeById(schemeId) {
  const result = await pool.query(`SELECT * FROM schemes WHERE scheme_id = $1;`, [schemeId]);
  if (result.rows.length === 0) {
    throw new NotFoundError(`Scheme with ID '${schemeId}' not found.`);
  }
  return result.rows[0];
}

async function createScheme(schemeData) {
  // Check for duplicate scheme_id
  const check = await pool.query(`SELECT scheme_id FROM schemes WHERE scheme_id = $1;`, [schemeData.scheme_id]);
  if (check.rows.length > 0) {
    throw new ValidationError(`Scheme with ID '${schemeData.scheme_id}' already exists.`);
  }

  const columns = [
    "scheme_id", "scheme_name", "category", "target_group", "min_age", "max_age", "age_rule",
    "education_min", "education_rule", "max_family_income", "income_rule", "location_scope",
    "employment_status", "benefit_type", "benefit_value", "benefit_amount", "benefit_unit",
    "benefit_duration", "documents_required", "documents_status", "application_url",
    "application_url_status", "source_url", "source_page_title", "is_mandatory_criterion",
    "eligibility_conditions", "verification_comments", "status", "review_status"
  ];

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const values = columns.map((col) => schemeData[col] !== undefined ? schemeData[col] : null);

  const query = `
    INSERT INTO schemes (${columns.join(", ")})
    VALUES (${placeholders})
    RETURNING *;
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function updateScheme(schemeId, schemeData) {
  await getSchemeById(schemeId);

  const columns = [
    "scheme_name", "category", "target_group", "min_age", "max_age", "age_rule",
    "education_min", "education_rule", "max_family_income", "income_rule", "location_scope",
    "employment_status", "benefit_type", "benefit_value", "benefit_amount", "benefit_unit",
    "benefit_duration", "documents_required", "documents_status", "application_url",
    "application_url_status", "source_url", "source_page_title", "is_mandatory_criterion",
    "eligibility_conditions", "verification_comments", "status", "review_status"
  ];

  const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(", ");
  const values = columns.map((col) => schemeData[col] !== undefined ? schemeData[col] : null);
  values.push(schemeId);

  const query = `
    UPDATE schemes
    SET ${setClause}, updated_at = NOW()
    WHERE scheme_id = $${values.length}
    RETURNING *;
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function setSchemeStatus(schemeId, status) {
  await getSchemeById(schemeId);
  const result = await pool.query(
    `UPDATE schemes SET status = $1, updated_at = NOW() WHERE scheme_id = $2 RETURNING *;`,
    [status, schemeId]
  );
  return result.rows[0];
}

async function deleteScheme(schemeId) {
  const existing = await getSchemeById(schemeId);
  await pool.query(`DELETE FROM schemes WHERE scheme_id = $1;`, [schemeId]);
  return existing;
}

async function filterSchemes(profile) {
  const { age, family_income, location, employment_status, category } = profile;

  const result = await pool.query(
    `
    SELECT *
    FROM schemes
    WHERE is_recommendation_eligible = true
      AND status = 'active'
      AND category = $1
      AND (min_age IS NULL OR $2 >= min_age)
      AND (max_age IS NULL OR $2 <= max_age)
      AND (max_family_income IS NULL OR $3 <= max_family_income)
      AND (
        location_scope = 'pan_india'
        OR (location_scope = 'tamil_nadu' AND LOWER($4) = 'tamil nadu')
      )
      AND (
        employment_status IS NULL
        OR cardinality(employment_status) = 0
        OR $5::text IS NULL
        OR $5::text = ANY(employment_status)
      )
    ORDER BY scheme_name;
    `,
    [category, age, family_income, location, employment_status || null]
  );

  return result.rows;
}

module.exports = {
  getAllSchemes,
  getSchemeById,
  createScheme,
  updateScheme,
  setSchemeStatus,
  deleteScheme,
  filterSchemes,
};