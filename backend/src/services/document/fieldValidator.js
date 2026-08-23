/**
 * Field Validator & Contradiction Detector — Stage 5
 * Validates extracted fields against expected structure, checks required fields,
 * validates regex patterns, and detects internal semantic contradictions.
 */

const { DOCUMENT_RULES, getDocumentLabel } = require("../documentRules");

function validate(extractedFields, documentType, fullText = "") {
  const rules = DOCUMENT_RULES[documentType];
  const label = getDocumentLabel(documentType);
  const textLower = (fullText || "").toLowerCase();

  if (!rules) {
    return { pass: false, code: "UNKNOWN_TYPE", userMessage: "An unexpected error occurred." };
  }

  const issues = [];
  const contradictions = [];
  const validationResults = {};

  // ─── 1. CONTRADICTION CHECKS ───
  if (documentType === "marksheet_10") {
    if (textLower.includes("higher secondary") || textLower.includes("class xii") || textLower.includes("class 12") || textLower.includes("hsc")) {
      contradictions.push("Found Higher Secondary / 12th markers in a 10th Marksheet");
    }
  }

  if (documentType === "marksheet_12") {
    if (textLower.includes("secondary school leaving") && !textLower.includes("higher")) {
      contradictions.push("Found SSLC / 10th markers without Higher Secondary in a 12th Marksheet");
    }
  }

  if (documentType === "income_certificate") {
    if (extractedFields.income_amount !== undefined && extractedFields.income_amount !== null) {
      if (extractedFields.income_amount <= 0) {
        contradictions.push("Extracted annual income is zero or negative");
      }
    }
  }

  if (documentType === "degree") {
    const deg = (extractedFields.degree_name || "").toLowerCase();
    if (deg.includes("semester") || deg.includes("statement of marks") || deg.includes("grade card")) {
      contradictions.push("Extracted degree title contains semester marksheet terminology");
    }
  }

  if (contradictions.length > 0) {
    return {
      pass: false,
      code: "CONTRADICTION",
      userMessage: `This document contains conflicting information for a ${label}. Please upload your official ${label}.`,
      data: { contradictions, issues }
    };
  }

  // ─── 2. CHECK REQUIRED FIELDS ───
  for (const field of rules.requiredFields) {
    if (!extractedFields[field]) {
      issues.push(field);
      validationResults[field] = "missing";
    } else {
      validationResults[field] = "present";
    }
  }

  // ─── 3. VALIDATE FORMAT PATTERNS ───
  for (const [fieldName, patternDef] of Object.entries(rules.patterns)) {
    const value = extractedFields[fieldName];
    if (value) {
      const stringVal = String(value);
      if (!patternDef.regex.test(stringVal)) {
        validationResults[fieldName] = `invalid_format (expected ${patternDef.description})`;
        issues.push(fieldName);
      } else {
        validationResults[fieldName] = "valid_format";
      }
    }
  }

  // ─── 4. HANDLE ISSUES WITH CITIZEN-FRIENDLY FEEDBACK ───
  if (issues.length > 0) {
    if (issues.includes("pan_number")) {
      return {
        pass: false,
        code: "INVALID_PAN",
        userMessage: "The PAN number could not be verified from this document. Please upload a clear and complete PAN Card.",
        data: { issues, validationResults }
      };
    }
    if (issues.includes("aadhaar_number")) {
      return {
        pass: false,
        code: "INVALID_AADHAAR",
        userMessage: "The Aadhaar number could not be verified from this document. Please upload a clear and complete Aadhaar Card.",
        data: { issues, validationResults }
      };
    }
    if (issues.includes("income_amount")) {
      return {
        pass: false,
        code: "INVALID_INCOME",
        userMessage: "The income details could not be verified from this document. Please upload a valid Income Certificate.",
        data: { issues, validationResults }
      };
    }
    if (issues.includes("degree_name")) {
      return {
        pass: false,
        code: "MISSING_DEGREE",
        userMessage: `This doesn't appear to be a valid Degree Certificate. Please upload your official Degree Certificate.`,
        data: { issues, validationResults }
      };
    }

    return {
      pass: false,
      code: "MISSING_FIELDS",
      userMessage: `We couldn't find some required information in this ${label}. Please upload a complete and readable document.`,
      data: { issues, validationResults }
    };
  }

  return {
    pass: true,
    code: "OK",
    data: { validationResults, contradictions: [] }
  };
}

module.exports = { validate };
