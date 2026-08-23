const path = require("path");
const XLSX = require("xlsx");
const { Client } = require("pg");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

// ==================================================
// CONFIGURATION
// ==================================================

const excelPath = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "Schemes_Eligibility_Matrix_PRODUCTION_READY.xlsx"
);

const SHEET_NAME = "Schemes";

// Columns that actually exist in the Supabase schemes table.
// Generated column `is_recommendation_eligible` is NOT inserted.
const DB_COLUMNS = [
  "scheme_id",
  "scheme_name",
  "category",
  "target_group",

  "min_age",
  "max_age",
  "age_rule",

  "education_min",
  "education_rule",

  "max_family_income",
  "income_rule",

  "location_scope",
  "employment_status",

  "benefit_type",
  "benefit_value",
  "benefit_amount",
  "benefit_unit",
  "benefit_duration",

  "documents_required",
  "documents_status",

  "application_url",
  "application_url_status",
  "application_url_checked_on",

  "source_url",
  "source_page_title",
  "source_verified_on",

  "is_mandatory_criterion",
  "eligibility_conditions",
  "verification_comments",

  "status",
  "review_status",
];

// ==================================================
// GENERAL HELPERS
// ==================================================

function isEmpty(value) {
  if (value === null || value === undefined) {
    return true;
  }

  const text = String(value).trim().toLowerCase();

  return [
    "",
    "na",
    "n/a",
    "not specified",
    "to be verified",
  ].includes(text);
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return text === "" ? null : text;
}

function cleanInteger(value) {
  if (isEmpty(value)) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.trunc(number);
}

// ==================================================
// ARRAY CLEANING
// ==================================================

function cleanArray(value) {
  if (isEmpty(value)) {
    return [];
  }

  return String(value)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanEmploymentStatus(value) {
  if (isEmpty(value)) {
    return [];
  }

  const text = String(value).trim().toLowerCase();

  // Handle slash-separated values
  if (text.includes("/")) {
    return text
      .split("/")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  // Handle semicolon-separated values
  if (text.includes(";")) {
    return text
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [text];
}

// ==================================================
// APPLICATION URL STATUS
// ==================================================

function cleanApplicationUrlStatus(value) {
  if (isEmpty(value)) {
    return "not_tested";
  }

  const text = String(value).trim().toLowerCase();

  if (text === "working") {
    return "working";
  }

  if (text === "not tested") {
    return "not_tested";
  }

  if (text === "needs verification") {
    return "needs_verification";
  }

  if (text === "not applicable (scheme ended)") {
    return "not_applicable";
  }

  // Safety fallback.
  // Any unexpected value is treated as requiring verification.
  console.warn(
    `⚠️ Unknown application_url_status: "${value}" → needs_verification`
  );

  return "needs_verification";
}

// ==================================================
// DOCUMENT STATUS
// ==================================================

function cleanDocumentsStatus(value) {
  if (isEmpty(value)) {
    return "not_verified";
  }

  const text = String(value).trim().toLowerCase();

  if (text === "verified") {
    return "verified";
  }

  if (text === "not applicable") {
    return "not_applicable";
  }

  if (text === "not_verified" || text === "not verified") {
    return "not_verified";
  }

  // Safety fallback
  return "not_verified";
}

// ==================================================
// DATE CLEANING
// ==================================================

function cleanDate(value) {
  if (isEmpty(value)) {
    return null;
  }

  // JavaScript Date
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  // Excel serial date
  if (typeof value === "number") {
    const excelDate = XLSX.SSF.parse_date_code(value);

    if (excelDate) {
      const month = String(excelDate.m).padStart(2, "0");
      const day = String(excelDate.d).padStart(2, "0");

      return `${excelDate.y}-${month}-${day}`;
    }
  }

  // String date
  const date = new Date(value);

  if (!isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return null;
}

// ==================================================
// ROW TRANSFORMATION
// ==================================================

function transformRow(row) {
  return {
    scheme_id: cleanText(row.scheme_id),

    scheme_name: cleanText(row.scheme_name),

    category: cleanText(row.category),

    target_group: cleanText(row.target_group),

    min_age: cleanInteger(row.min_age),

    max_age: cleanInteger(row.max_age),

    age_rule: cleanText(row.age_rule),

    education_min: cleanText(row.education_min),

    education_rule: cleanText(row.education_rule),

    max_family_income: cleanInteger(
      row.max_family_income
    ),

    income_rule: cleanText(row.income_rule),

    location_scope: cleanText(row.location_scope),

    employment_status: cleanEmploymentStatus(
      row.employment_status
    ),

    benefit_type: cleanText(row.benefit_type),

    benefit_value: cleanText(row.benefit_value),

    benefit_amount: cleanInteger(
      row.benefit_amount
    ),

    benefit_unit: cleanText(row.benefit_unit),

    benefit_duration: cleanText(
      row.benefit_duration
    ),

    documents_required: cleanArray(
      row.documents_required
    ),

    documents_status: cleanDocumentsStatus(
      row.documents_status
    ),

    application_url: cleanText(
      row.application_url
    ),

    application_url_status:
      cleanApplicationUrlStatus(
        row.application_url_status
      ),

    application_url_checked_on: cleanDate(
      row.application_url_checked_on
    ),

    source_url: cleanText(row.source_url),

    source_page_title: cleanText(
      row.source_page_title
    ),

    source_verified_on: cleanDate(
      row.source_verified_on
    ),

    is_mandatory_criterion: cleanText(
      row.is_mandatory_criterion
    ),

    eligibility_conditions: cleanText(
      row.eligibility_conditions
    ),

    verification_comments: cleanText(
      row.verification_comments
    ),

    status:
      cleanText(row.status) || "active",

    review_status:
      cleanText(row.review_status) ||
      "needs_review",
  };
}

// ==================================================
// VALIDATE TRANSFORMED DATA
// ==================================================

function validateRows(rows) {
  console.log("\n🔍 Validating Excel data...");

  // Check missing scheme IDs
  const missingIds = rows.filter(
    (row) => !row.scheme_id
  );

  if (missingIds.length > 0) {
    throw new Error(
      `${missingIds.length} rows have missing scheme_id`
    );
  }

  // Check duplicate scheme IDs
  const ids = rows.map(
    (row) => row.scheme_id
  );

  const duplicateIds = ids.filter(
    (id, index) =>
      ids.indexOf(id) !== index
  );

  if (duplicateIds.length > 0) {
    throw new Error(
      `Duplicate scheme_id values found: ${[
        ...new Set(duplicateIds),
      ].join(", ")}`
    );
  }

  // Check required fields
  const missingNames = rows.filter(
    (row) => !row.scheme_name
  );

  if (missingNames.length > 0) {
    throw new Error(
      `${missingNames.length} rows have missing scheme_name`
    );
  }

  const missingCategory = rows.filter(
    (row) => !row.category
  );

  if (missingCategory.length > 0) {
    throw new Error(
      `${missingCategory.length} rows have missing category`
    );
  }

  const invalidCategory = rows.filter(
    (row) =>
      !["student", "graduate", "startup"].includes(
        row.category
      )
  );

  if (invalidCategory.length > 0) {
    throw new Error(
      `Invalid category found in ${invalidCategory.length} rows`
    );
  }

  const missingLocation = rows.filter(
    (row) => !row.location_scope
  );

  if (missingLocation.length > 0) {
    throw new Error(
      `${missingLocation.length} rows have missing location_scope`
    );
  }

  const invalidLocation = rows.filter(
    (row) =>
      !["pan_india", "tamil_nadu"].includes(
        row.location_scope
      )
  );

  if (invalidLocation.length > 0) {
    throw new Error(
      `Invalid location_scope found in ${invalidLocation.length} rows`
    );
  }

  // Check age ranges
  const invalidAgeRanges = rows.filter(
    (row) =>
      row.min_age !== null &&
      row.max_age !== null &&
      row.min_age > row.max_age
  );

  if (invalidAgeRanges.length > 0) {
    throw new Error(
      `${invalidAgeRanges.length} rows have min_age > max_age`
    );
  }

  console.log("✅ Basic validation passed");
}

// ==================================================
// BUILD UPSERT QUERY
// ==================================================

function buildUpsertQuery() {
  const columns = DB_COLUMNS.join(", ");

  const placeholders = DB_COLUMNS
    .map((_, index) => `$${index + 1}`)
    .join(", ");

  const updateColumns = DB_COLUMNS
    .filter(
      (column) => column !== "scheme_id"
    )
    .map(
      (column) =>
        `${column} = EXCLUDED.${column}`
    )
    .join(",\n        ");

  return `
    INSERT INTO schemes (
      ${columns}
    )
    VALUES (
      ${placeholders}
    )
    ON CONFLICT (scheme_id)
    DO UPDATE SET
        ${updateColumns},
        updated_at = NOW();
  `;
}

// ==================================================
// MAIN FUNCTION
// ==================================================

async function main() {
  console.log("========================================");
  console.log("   GOVASSIST SCHEME DATA LOADER");
  console.log("========================================");

  // ------------------------------------------------
  // 1. Check DATABASE_URL
  // ------------------------------------------------

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is missing from backend/.env"
    );
  }

  // ------------------------------------------------
  // 2. Read Excel
  // ------------------------------------------------

  console.log("\n📄 Excel file:");
  console.log(excelPath);

  const workbook = XLSX.readFile(
    excelPath,
    {
      cellDates: true,
    }
  );

  if (
    !workbook.SheetNames.includes(
      SHEET_NAME
    )
  ) {
    throw new Error(
      `Sheet "${SHEET_NAME}" was not found.\nAvailable sheets: ${workbook.SheetNames.join(
        ", "
      )}`
    );
  }

  const worksheet =
    workbook.Sheets[SHEET_NAME];

  const rows = XLSX.utils.sheet_to_json(
    worksheet,
    {
      defval: null,
    }
  );

  console.log(
    `\n📊 Rows found in Excel: ${rows.length}`
  );

  if (rows.length === 0) {
    throw new Error(
      "No data found in the Schemes sheet."
    );
  }

  // ------------------------------------------------
  // 3. Transform
  // ------------------------------------------------

  console.log("\n🔄 Transforming data...");

  const transformedRows =
    rows.map(transformRow);

  console.log("✅ Transformation complete");

  // ------------------------------------------------
  // 4. Validate
  // ------------------------------------------------

  validateRows(transformedRows);

  // ------------------------------------------------
  // 5. Show summary
  // ------------------------------------------------

  const categorySummary =
    transformedRows.reduce(
      (acc, row) => {
        acc[row.category] =
          (acc[row.category] || 0) + 1;

        return acc;
      },
      {}
    );

  console.log("\n📊 Category summary:");

  Object.entries(categorySummary).forEach(
    ([category, count]) => {
      console.log(
        `   ${category}: ${count}`
      );
    }
  );

  // ------------------------------------------------
  // 6. Connect to Supabase
  // ------------------------------------------------

  console.log(
    "\n🔌 Connecting to Supabase..."
  );

  const client = new Client({
    connectionString:
      process.env.DATABASE_URL,
  });

  await client.connect();

  console.log(
    "✅ Connected to Supabase"
  );

  // ------------------------------------------------
  // 7. Prepare UPSERT query
  // ------------------------------------------------

  const query =
    buildUpsertQuery();

  let processed = 0;

  // ------------------------------------------------
  // 8. Insert / Update
  // ------------------------------------------------

  try {
    await client.query("BEGIN");

    for (const row of transformedRows) {
      const values = DB_COLUMNS.map(
        (column) => row[column]
      );

      await client.query(
        query,
        values
      );

      processed++;

      if (
        processed % 10 === 0 ||
        processed === transformedRows.length
      ) {
        console.log(
          `   Processed ${processed}/${transformedRows.length}`
        );
      }
    }

    await client.query("COMMIT");

    console.log(
      "\n✅ Transaction committed"
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "\n❌ Loading failed. Transaction rolled back."
    );

    throw error;
  } finally {
    await client.end();
  }

  // ------------------------------------------------
  // 9. Final result
  // ------------------------------------------------

  console.log("\n========================================");
  console.log("           LOAD COMPLETE");
  console.log("========================================");

  console.log(
    `Excel rows processed : ${transformedRows.length}`
  );

  console.log(
    `Database rows upserted: ${processed}`
  );

  console.log(
    "\n✅ Schemes successfully loaded into Supabase."
  );
}

// ==================================================
// ERROR HANDLING
// ==================================================

main().catch((error) => {
  console.error("\n❌ ERROR:");
  console.error(error.message);

  process.exit(1);
});