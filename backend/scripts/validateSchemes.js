const { Client } = require("pg");
require("dotenv").config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log("========================================");
  console.log("   GOVASSIST SCHEME DATA VALIDATION");
  console.log("========================================\n");

  await client.connect();

  let failed = false;

  // ------------------------------------------
  // 1. Total schemes
  // ------------------------------------------

  const totalResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM schemes;
  `);

  const total = totalResult.rows[0].count;

  console.log(`Total schemes: ${total}`);

  if (total === 95) {
    console.log("✅ Expected 95");
  } else {
    console.log("❌ Expected 95");
    failed = true;
  }

  // ------------------------------------------
  // 2. Category counts
  // ------------------------------------------

  const categoryResult = await client.query(`
    SELECT category, COUNT(*)::int AS count
    FROM schemes
    GROUP BY category
    ORDER BY category;
  `);

  console.log("\nCategory distribution:");

  const expectedCategories = {
    student: 43,
    startup: 33,
    graduate: 19,
  };

  for (const row of categoryResult.rows) {
    const expected = expectedCategories[row.category];

    console.log(
      `  ${row.category}: ${row.count} (expected ${expected})`
    );

    if (row.count !== expected) {
      failed = true;
    }
  }

  // ------------------------------------------
  // 3. Recommendation eligibility
  // ------------------------------------------

  const eligibilityResult = await client.query(`
    SELECT
      is_recommendation_eligible,
      COUNT(*)::int AS count
    FROM schemes
    GROUP BY is_recommendation_eligible
    ORDER BY is_recommendation_eligible;
  `);

  console.log("\nRecommendation eligibility:");

  for (const row of eligibilityResult.rows) {
    console.log(
      `  ${row.is_recommendation_eligible}: ${row.count}`
    );
  }

  const eligibleResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM schemes
    WHERE is_recommendation_eligible = true;
  `);

  const eligible =
    eligibleResult.rows[0].count;

  if (eligible === 52) {
    console.log("✅ 52 recommendation-eligible schemes");
  } else {
    console.log(
      `❌ Expected 52, found ${eligible}`
    );
    failed = true;
  }

  // ------------------------------------------
  // 4. Duplicate scheme IDs
  // ------------------------------------------

  const duplicateResult = await client.query(`
    SELECT scheme_id, COUNT(*)::int AS count
    FROM schemes
    GROUP BY scheme_id
    HAVING COUNT(*) > 1;
  `);

  console.log("\nDuplicate scheme IDs:");

  if (duplicateResult.rows.length === 0) {
    console.log("✅ No duplicates");
  } else {
    console.log("❌ Duplicate IDs found:");

    duplicateResult.rows.forEach((row) => {
      console.log(
        `  ${row.scheme_id}: ${row.count}`
      );
    });

    failed = true;
  }

  // ------------------------------------------
  // 5. Missing required fields
  // ------------------------------------------

  const missingResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM schemes
    WHERE scheme_id IS NULL
       OR scheme_name IS NULL
       OR category IS NULL
       OR location_scope IS NULL;
  `);

  const missing =
    missingResult.rows[0].count;

  console.log("\nMissing required fields:");

  if (missing === 0) {
    console.log("✅ None");
  } else {
    console.log(
      `❌ ${missing} schemes have missing required fields`
    );

    failed = true;
  }

  // ------------------------------------------
  // 6. Invalid age ranges
  // ------------------------------------------

  const ageResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM schemes
    WHERE min_age IS NOT NULL
      AND max_age IS NOT NULL
      AND min_age > max_age;
  `);

  const invalidAges =
    ageResult.rows[0].count;

  console.log("\nInvalid age ranges:");

  if (invalidAges === 0) {
    console.log("✅ None");
  } else {
    console.log(
      `❌ ${invalidAges} invalid age ranges`
    );

    failed = true;
  }

  // ------------------------------------------
  // 7. Invalid statuses
  // ------------------------------------------

  const statusResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM schemes
    WHERE status NOT IN (
      'active',
      'inactive',
      'suspended',
      'closed'
    );
  `);

  const invalidStatuses =
    statusResult.rows[0].count;

  console.log("\nInvalid scheme statuses:");

  if (invalidStatuses === 0) {
    console.log("✅ None");
  } else {
    console.log(
      `❌ ${invalidStatuses} invalid statuses`
    );

    failed = true;
  }

  // ------------------------------------------
  // 8. Invalid application URL statuses
  // ------------------------------------------

  const urlStatusResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM schemes
    WHERE application_url_status NOT IN (
      'working',
      'not_tested',
      'needs_verification',
      'not_applicable'
    );
  `);

  const invalidUrlStatuses =
    urlStatusResult.rows[0].count;

  console.log(
    "\nInvalid application URL statuses:"
  );

  if (invalidUrlStatuses === 0) {
    console.log("✅ None");
  } else {
    console.log(
      `❌ ${invalidUrlStatuses} invalid URL statuses`
    );

    failed = true;
  }

  // ------------------------------------------
  // 9. Array fields
  // ------------------------------------------

  const arrayResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM schemes
    WHERE documents_required IS NOT NULL
      AND pg_typeof(documents_required)::text = 'text[]';
  `);

  console.log("\nDocuments array field:");
  console.log(
    `  ${arrayResult.rows[0].count} rows have text[] documents_required`
  );

  // ------------------------------------------
  // FINAL RESULT
  // ------------------------------------------

  console.log("\n========================================");

  if (failed) {
    console.log("❌ VALIDATION FAILED");
    console.log("========================================");

    await client.end();
    process.exit(1);
  }

  console.log("✅ ALL VALIDATION CHECKS PASSED");
  console.log("========================================");

  await client.end();
}

main().catch(async (error) => {
  console.error("\n❌ Validation error:");
  console.error(error.message);

  try {
    await client.end();
  } catch {}

  process.exit(1);
});