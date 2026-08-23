/**
 * GOVASSIST SCHEME DATA VALIDATOR & NORMALIZER (Admin & Import)
 */

function validateAndNormalizeScheme(schemeInput, isUpdate = false) {
  if (!schemeInput || typeof schemeInput !== "object") {
    return {
      isValid: false,
      errors: ["Scheme data must be an object."],
      normalized: null,
    };
  }

  const errors = [];
  const normalized = {};

  // 1. scheme_id
  if (!schemeInput.scheme_id || typeof schemeInput.scheme_id !== "string" || !schemeInput.scheme_id.trim()) {
    errors.push("`scheme_id` is mandatory and must be a non-empty string.");
  } else {
    normalized.scheme_id = schemeInput.scheme_id.trim();
  }

  // 2. scheme_name
  if (!schemeInput.scheme_name || typeof schemeInput.scheme_name !== "string" || !schemeInput.scheme_name.trim()) {
    errors.push("`scheme_name` is mandatory and must be a non-empty string.");
  } else {
    normalized.scheme_name = schemeInput.scheme_name.trim();
  }

  // 3. category
  if (!schemeInput.category || typeof schemeInput.category !== "string" || !schemeInput.category.trim()) {
    errors.push("`category` is mandatory and must be one of: 'student', 'graduate', 'startup'.");
  } else {
    normalized.category = schemeInput.category.trim().toLowerCase();
    if (!["student", "graduate", "startup"].includes(normalized.category)) {
      errors.push("`category` must be one of: 'student', 'graduate', 'startup'.");
    }
  }

  // 4. location_scope
  if (!schemeInput.location_scope || typeof schemeInput.location_scope !== "string" || !schemeInput.location_scope.trim()) {
    errors.push("`location_scope` is mandatory and must be 'pan_india' or 'tamil_nadu'.");
  } else {
    normalized.location_scope = schemeInput.location_scope.trim().toLowerCase();
    if (!["pan_india", "tamil_nadu"].includes(normalized.location_scope)) {
      errors.push("`location_scope` must be 'pan_india' or 'tamil_nadu'.");
    }
  }

  // 5. min_age & max_age validation
  normalized.min_age = schemeInput.min_age !== undefined && schemeInput.min_age !== null && schemeInput.min_age !== "" ? Number(schemeInput.min_age) : null;
  normalized.max_age = schemeInput.max_age !== undefined && schemeInput.max_age !== null && schemeInput.max_age !== "" ? Number(schemeInput.max_age) : null;

  if (normalized.min_age !== null && (Number.isNaN(normalized.min_age) || normalized.min_age < 0 || normalized.min_age > 120)) {
    errors.push("`min_age` must be a valid age between 0 and 120.");
  }
  if (normalized.max_age !== null && (Number.isNaN(normalized.max_age) || normalized.max_age < 0 || normalized.max_age > 120)) {
    errors.push("`max_age` must be a valid age between 0 and 120.");
  }
  if (normalized.min_age !== null && normalized.max_age !== null && normalized.min_age > normalized.max_age) {
    errors.push("`min_age` cannot be greater than `max_age`.");
  }

  // 6. max_family_income validation
  normalized.max_family_income = schemeInput.max_family_income !== undefined && schemeInput.max_family_income !== null && schemeInput.max_family_income !== "" ? Number(schemeInput.max_family_income) : null;
  if (normalized.max_family_income !== null && (Number.isNaN(normalized.max_family_income) || normalized.max_family_income < 0)) {
    errors.push("`max_family_income` must be a non-negative number.");
  }

  // 7. application_url & application_url_status
  normalized.application_url = schemeInput.application_url ? String(schemeInput.application_url).trim() : null;
  if (normalized.application_url && !normalized.application_url.startsWith("http://") && !normalized.application_url.startsWith("https://")) {
    errors.push("`application_url` must be a valid HTTP or HTTPS URL.");
  }

  normalized.application_url_status = schemeInput.application_url_status ? String(schemeInput.application_url_status).trim().toLowerCase() : "not_tested";
  const validUrlStatuses = ["working", "needs_verification", "not_tested", "not_applicable"];
  if (!validUrlStatuses.includes(normalized.application_url_status)) {
    normalized.application_url_status = "needs_verification";
  }

  // 8. documents_required & employment_status arrays
  if (Array.isArray(schemeInput.documents_required)) {
    normalized.documents_required = schemeInput.documents_required.map(d => String(d).trim()).filter(Boolean);
  } else if (typeof schemeInput.documents_required === "string") {
    normalized.documents_required = schemeInput.documents_required.split(";").map(d => d.trim()).filter(Boolean);
  } else {
    normalized.documents_required = [];
  }

  if (Array.isArray(schemeInput.employment_status)) {
    normalized.employment_status = schemeInput.employment_status.map(e => String(e).trim().toLowerCase()).filter(Boolean);
  } else if (typeof schemeInput.employment_status === "string") {
    normalized.employment_status = schemeInput.employment_status.split(/[/;]/).map(e => e.trim().toLowerCase()).filter(Boolean);
  } else {
    normalized.employment_status = [];
  }

  // 9. Other optional fields
  normalized.target_group = schemeInput.target_group ? String(schemeInput.target_group).trim() : null;
  normalized.age_rule = schemeInput.age_rule ? String(schemeInput.age_rule).trim() : null;
  normalized.education_min = schemeInput.education_min ? String(schemeInput.education_min).trim() : null;
  normalized.education_rule = schemeInput.education_rule ? String(schemeInput.education_rule).trim() : null;
  normalized.income_rule = schemeInput.income_rule ? String(schemeInput.income_rule).trim() : null;
  normalized.benefit_type = schemeInput.benefit_type ? String(schemeInput.benefit_type).trim() : null;
  normalized.benefit_value = schemeInput.benefit_value ? String(schemeInput.benefit_value).trim() : null;
  normalized.benefit_amount = schemeInput.benefit_amount !== undefined && schemeInput.benefit_amount !== null && schemeInput.benefit_amount !== "" ? Number(schemeInput.benefit_amount) : null;
  normalized.benefit_unit = schemeInput.benefit_unit ? String(schemeInput.benefit_unit).trim() : null;
  normalized.benefit_duration = schemeInput.benefit_duration ? String(schemeInput.benefit_duration).trim() : null;
  normalized.documents_status = schemeInput.documents_status ? String(schemeInput.documents_status).trim().toLowerCase() : "not_verified";
  normalized.source_url = schemeInput.source_url ? String(schemeInput.source_url).trim() : null;
  normalized.source_page_title = schemeInput.source_page_title ? String(schemeInput.source_page_title).trim() : null;
  normalized.is_mandatory_criterion = schemeInput.is_mandatory_criterion ? String(schemeInput.is_mandatory_criterion).trim() : null;
  normalized.eligibility_conditions = schemeInput.eligibility_conditions ? String(schemeInput.eligibility_conditions).trim() : null;
  normalized.verification_comments = schemeInput.verification_comments ? String(schemeInput.verification_comments).trim() : null;

  // Status & Review status
  normalized.status = schemeInput.status ? String(schemeInput.status).trim().toLowerCase() : "active";
  if (!["active", "archived", "draft"].includes(normalized.status)) {
    normalized.status = "active";
  }

  normalized.review_status = schemeInput.review_status ? String(schemeInput.review_status).trim().toLowerCase() : "needs_review";

  return {
    isValid: errors.length === 0,
    errors,
    normalized,
  };
}

module.exports = {
  validateAndNormalizeScheme,
};
