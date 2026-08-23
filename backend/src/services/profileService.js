const pool = require("../../config/db");
const { userIdToUUID } = require("../utils/uuidHelper");

async function createOrUpdateProfile(userId, profile) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    ? userId
    : userIdToUUID(userId);
  const {
    email,
    category,
    age,
    education,
    field_of_study,
    family_income,
    location,
    employment_status,
    work_experience_years,
    goal,
  } = profile;

  const result = await pool.query(
    `
    INSERT INTO profiles (
      user_id,
      email,
      category,
      age,
      education,
      field_of_study,
      family_income,
      location,
      employment_status,
      work_experience_years,
      goal
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
    )

    ON CONFLICT (user_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      category = EXCLUDED.category,
      age = EXCLUDED.age,
      education = EXCLUDED.education,
      field_of_study = EXCLUDED.field_of_study,
      family_income = EXCLUDED.family_income,
      location = EXCLUDED.location,
      employment_status = EXCLUDED.employment_status,
      work_experience_years =
        EXCLUDED.work_experience_years,
      goal = EXCLUDED.goal,
      updated_at = now()

    RETURNING *;
    `,
    [
      uuid,
      email,
      category,
      age,
      education,
      field_of_study,
      family_income,
      location,
      employment_status,
      work_experience_years,
      goal,
    ]
  );

  return result.rows[0];
}

module.exports = {
  createOrUpdateProfile,
};