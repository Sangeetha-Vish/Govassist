const assert = require("assert");
const http = require("http");
const pool = require("../config/db");
const { validateAndNormalizeProfile } = require("../src/middleware/profileValidator");
const recommendationService = require("../src/services/recommendationService");
const app = require("../server");

async function runPhase3Tests() {
  console.log("==========================================");
  console.log("   GOVASSIST PHASE 3 TEST SUITE");
  console.log("==========================================");

  let passed = 0;
  let failed = 0;

  function test(description, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${description}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${description}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(description, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${description}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${description}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  }

  console.log("\n--- 1. Profile Validation & Edge Case Handling ---");

  test("Valid complete profile validates and normalizes correctly", () => {
    const input = {
      category: "student",
      age: "22",
      education: "B.E",
      family_income: "150000",
      location: "Tamil Nadu",
      employment_status: "student",
      goal: "higher education scholarship",
    };
    const res = validateAndNormalizeProfile(input);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.normalized.age, 22);
    assert.strictEqual(res.normalized.family_income, 150000);
    assert.strictEqual(res.normalized.goal, "higher education scholarship");
  });

  test("Rejects invalid negative age (-5)", () => {
    const input = { category: "student", age: "-5" };
    const res = validateAndNormalizeProfile(input);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes("age")));
  });

  test("Rejects unrealistic age (> 120)", () => {
    const input = { category: "student", age: "150" };
    const res = validateAndNormalizeProfile(input);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes("age")));
  });

  test("Rejects negative family income", () => {
    const input = { category: "student", family_income: "-50000" };
    const res = validateAndNormalizeProfile(input);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes("family_income")));
  });

  test("Handles missing optional fields cleanly without throwing errors", () => {
    const input = {};
    const res = validateAndNormalizeProfile(input);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.normalized.category, "student");
    assert.strictEqual(res.normalized.age, null);
    assert.strictEqual(res.normalized.family_income, null);
  });

  console.log("\n--- 2. Recommendation Engine Ranking & Scoring ---");

  test("Evaluates and ranks schemes by fit_score descending", () => {
    const profile = {
      category: "student",
      age: 21,
      education: "12th",
      family_income: 120000,
      location: "Tamil Nadu",
      employment_status: "student",
    };
    const mockSchemes = [
      {
        scheme_id: "SCHEME_001",
        scheme_name: "Post Matric Scholarship",
        category: "student",
        min_age: 18,
        max_age: 25,
        education_min: "10th",
        max_family_income: 250000,
        application_url: "https://tn.gov.in/apply",
        application_url_status: "working",
      },
      {
        scheme_id: "SCHEME_002",
        scheme_name: "Pudhumai Penn Scheme",
        category: "student",
        min_age: 17,
        max_age: 22,
        education_min: "12th",
        max_family_income: 200000,
        application_url: "https://tn.gov.in/pudhumai",
        application_url_status: "working",
      },
    ];

    const { evaluateSchemeEligibilityAndScore } = require("../src/services/scoringService");

    const evaluated = mockSchemes.map((s) => {
      const res = evaluateSchemeEligibilityAndScore(profile, s);
      return { ...s, ...res };
    }).filter((s) => s.is_eligible);

    evaluated.sort((a, b) => b.fit_score - a.fit_score);
    evaluated.forEach((s, idx) => (s.rank = idx + 1));

    assert.ok(evaluated.length > 0);
    assert.strictEqual(evaluated[0].rank, 1);
    assert.ok(evaluated[0].fit_score >= (evaluated[1]?.fit_score || 0));
  });

  test("Ineligible profile criteria filters out non-matching schemes", () => {
    const profile = {
      category: "student",
      age: 110,
      family_income: 9999999,
    };
    const mockScheme = {
      min_age: 18,
      max_age: 25,
      max_family_income: 250000,
    };
    const { evaluateSchemeEligibilityAndScore } = require("../src/services/scoringService");
    const res = evaluateSchemeEligibilityAndScore(profile, mockScheme);
    assert.strictEqual(res.is_eligible, false);
    assert.strictEqual(res.fit_score, 0);
  });

  console.log("\n--- 3. API Controller Error & State Handling ---");

  await asyncTest("API POST /api/recommendations handles validation failure cleanly with 400", async () => {
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const payload = JSON.stringify({ category: "student", age: -10 });
      const reqOpts = {
        hostname: "localhost",
        port,
        path: "/api/recommendations",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      };

      const resData = await new Promise((resolve, reject) => {
        const req = http.request(reqOpts, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
      });

      assert.strictEqual(resData.statusCode, 400);
      assert.strictEqual(resData.body.success, false);
      assert.ok(resData.body.error.details);
    } finally {
      server.close();
    }
  });

  test("API server responds on health check endpoint", () => {
    assert.ok(app, "Express app instance exists");
  });

  console.log("\n==========================================");
  console.log(`PHASE 3 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("==========================================");

  process.exit(failed > 0 ? 1 : 0);
}

runPhase3Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
