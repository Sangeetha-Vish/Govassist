/**
 * GOVASSIST PROFILE VALIDATOR & NORMALIZER
 */

function validateAndNormalizeProfile(profileInput) {
  if (!profileInput || typeof profileInput !== "object") {
    return {
      isValid: false,
      errors: ["Profile data must be an object."],
      normalized: null,
    };
  }

  const errors = [];
  const normalized = {};

  // Field: category (validates allowed categories, defaults to 'student' if omitted)
  if (profileInput.category !== undefined && profileInput.category !== null && profileInput.category !== "") {
    if (typeof profileInput.category !== "string") {
      errors.push("`category` must be a string.");
    } else {
      const cat = profileInput.category.trim().toLowerCase();
      if (!["student", "graduate", "startup"].includes(cat)) {
        errors.push("`category` must be one of: 'student', 'graduate', 'startup'.");
      } else {
        normalized.category = cat;
      }
    }
  } else {
    normalized.category = "student";
  }

  // Optional / Conditional field: user_id
  if (profileInput.user_id !== undefined && profileInput.user_id !== null) {
    normalized.user_id = String(profileInput.user_id).trim();
  } else {
    normalized.user_id = null;
  }

  // Optional / Conditional field: email
  if (profileInput.email !== undefined && profileInput.email !== null) {
    normalized.email = String(profileInput.email).trim().toLowerCase();
  } else {
    normalized.email = null;
  }

  // Optional / Conditional field: age
  if (profileInput.age !== undefined && profileInput.age !== null && profileInput.age !== "") {
    const parsedAge = Number(profileInput.age);
    if (Number.isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120) {
      errors.push("`age` must be a valid number between 0 and 120.");
    } else {
      normalized.age = Math.floor(parsedAge);
    }
  } else {
    normalized.age = null;
  }

  // Optional field: education
  if (profileInput.education !== undefined && profileInput.education !== null) {
    normalized.education = String(profileInput.education).trim();
  } else {
    normalized.education = null;
  }

  // Optional field: field_of_study
  if (profileInput.field_of_study !== undefined && profileInput.field_of_study !== null) {
    normalized.field_of_study = String(profileInput.field_of_study).trim();
  } else {
    normalized.field_of_study = null;
  }

  // Optional field: family_income (Only validate if present, income is NOT mandatory globally unless required by scheme)
  if (
    profileInput.family_income !== undefined &&
    profileInput.family_income !== null &&
    profileInput.family_income !== ""
  ) {
    const parsedIncome = Number(profileInput.family_income);
    if (Number.isNaN(parsedIncome) || parsedIncome < 0) {
      errors.push("`family_income` must be a non-negative number.");
    } else {
      normalized.family_income = parsedIncome;
    }
  } else {
    normalized.family_income = null;
  }

  // Optional field: location
  if (profileInput.location !== undefined && profileInput.location !== null) {
    normalized.location = String(profileInput.location).trim();
  } else {
    normalized.location = null;
  }

  // Optional field: employment_status
  if (profileInput.employment_status !== undefined && profileInput.employment_status !== null) {
    normalized.employment_status = String(profileInput.employment_status).trim().toLowerCase();
  } else {
    normalized.employment_status = null;
  }

  // Optional field: work_experience_years
  if (
    profileInput.work_experience_years !== undefined &&
    profileInput.work_experience_years !== null &&
    profileInput.work_experience_years !== ""
  ) {
    const parsedExp = Number(profileInput.work_experience_years);
    if (Number.isNaN(parsedExp) || parsedExp < 0) {
      errors.push("`work_experience_years` must be a non-negative number.");
    } else {
      normalized.work_experience_years = Math.floor(parsedExp);
    }
  } else {
    normalized.work_experience_years = 0;
  }

  // Optional field: goal
  if (profileInput.goal !== undefined && profileInput.goal !== null) {
    normalized.goal = String(profileInput.goal).trim();
  } else {
    normalized.goal = null;
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalized,
  };
}

module.exports = {
  validateAndNormalizeProfile,
};
