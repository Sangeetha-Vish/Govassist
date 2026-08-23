const {
  evaluateSchemeEligibilityAndScore,
  ageEvaluation,
  educationEvaluation,
  incomeEvaluation,
} = require("../src/services/scoringService");
const { validateAndNormalizeProfile } = require("../src/middleware/profileValidator");

function runTests() {
  console.log("==========================================");
  console.log("   GOVASSIST CORE PHASE 1 TEST SUITE");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // --- 1. PROFILE VALIDATION TESTS ---
  console.log("--- 1. Profile Validation & Handling ---");
  
  const validProfile = validateAndNormalizeProfile({
    category: "student",
    age: "22",
    family_income: "150000",
  });
  assert(validProfile.isValid === true && validProfile.normalized.age === 22, "Valid profile parses correctly");

  const invalidCategory = validateAndNormalizeProfile({
    category: "invalid_cat",
  });
  assert(invalidCategory.isValid === false, "Rejects invalid category");

  const missingIncomeProfile = validateAndNormalizeProfile({
    category: "student",
    age: 20,
    // family_income not provided (optional)
  });
  assert(missingIncomeProfile.isValid === true && missingIncomeProfile.normalized.family_income === null, "Handles missing optional income field as null");

  // --- 2. HARD ELIGIBILITY TESTS ---
  console.log("\n--- 2. Hard Eligibility & Boundary Case Tests ---");

  const schemeWithBounds = {
    min_age: 18,
    max_age: 25,
    education_min: "12th",
    max_family_income: 200000,
    application_url: "https://example.gov.in/apply",
    application_url_status: "working",
  };

  // Fully Eligible
  const eligibleEval = evaluateSchemeEligibilityAndScore(
    { category: "student", age: 22, education: "B.E", family_income: 150000 },
    schemeWithBounds
  );
  assert(eligibleEval.is_eligible === true && eligibleEval.fit_score > 0, "Eligible profile gets is_eligible=true and score > 0");
  assert(eligibleEval.official_application_url === "https://example.gov.in/apply", "Returns working application URL");

  // Age Boundary: Exact min age (18)
  const minAgeEval = evaluateSchemeEligibilityAndScore(
    { category: "student", age: 18, education: "12th", family_income: 100000 },
    schemeWithBounds
  );
  assert(minAgeEval.is_eligible === true, "Boundary: Exact minimum age (18) is eligible");

  // Age Boundary: Exact max age (25)
  const maxAgeEval = evaluateSchemeEligibilityAndScore(
    { category: "student", age: 25, education: "12th", family_income: 100000 },
    schemeWithBounds
  );
  assert(maxAgeEval.is_eligible === true, "Boundary: Exact maximum age (25) is eligible");

  // Ineligible Age: Over max age (26)
  const overAgeEval = evaluateSchemeEligibilityAndScore(
    { category: "student", age: 26, education: "12th", family_income: 100000 },
    schemeWithBounds
  );
  assert(overAgeEval.is_eligible === false && overAgeEval.explanation.why_ineligible.length > 0, "Ineligible: Over age profile is rejected with explanation");

  // Income Boundary: Exact max family income
  const incomeBoundEval = evaluateSchemeEligibilityAndScore(
    { category: "student", age: 20, education: "12th", family_income: 200000 },
    schemeWithBounds
  );
  assert(incomeBoundEval.is_eligible === true, "Boundary: Family income exactly at maximum is eligible");

  // Ineligible Income: Exceeds limit
  const highIncomeEval = evaluateSchemeEligibilityAndScore(
    { category: "student", age: 20, education: "12th", family_income: 250000 },
    schemeWithBounds
  );
  assert(highIncomeEval.is_eligible === false && highIncomeEval.explanation.why_ineligible.length > 0, "Ineligible: Exceeding income limit fails hard eligibility");

  // Missing Info: Required income is missing when scheme has income requirement
  const missingIncomeEval = evaluateSchemeEligibilityAndScore(
    { category: "student", age: 20, education: "12th", family_income: null },
    schemeWithBounds
  );
  assert(missingIncomeEval.is_eligible === false && missingIncomeEval.explanation.missing_info.length > 0, "Missing required income fails hard eligibility and reports missing_info");

  // URL status check: URL not working -> return null
  const brokenUrlScheme = {
    ...schemeWithBounds,
    application_url_status: "needs_verification",
  };
  const brokenUrlEval = evaluateSchemeEligibilityAndScore(
    { category: "student", age: 22, education: "B.E", family_income: 150000 },
    brokenUrlScheme
  );
  assert(brokenUrlEval.official_application_url === null, "Unverified URL returns null instead of fake placeholder");

  // --- SUMMARY ---
  console.log("\n==========================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
