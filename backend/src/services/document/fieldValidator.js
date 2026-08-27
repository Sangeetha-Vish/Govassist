/**
 * Field Validator & Contradiction Detector — Stage 5
 * Validates extracted fields against expected structure, checks required fields,
 * validates regex patterns, and detects internal semantic contradictions.
 */

const { DOCUMENT_RULES, getDocumentLabel } = require("../documentRules");

function validate(extractedFields, documentType, fullText = "", existingDocs = []) {
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
  
  // ─── 1.5. CROSS-DOCUMENT NAME/DOB CONSISTENCY ───
  // If we have verified documents, check if the extracted name or dob severely conflicts
  if (existingDocs.length > 0) {
    for (const doc of existingDocs) {
      if (doc.verification_status === "verified" && doc.extracted_data) {
        const verifiedData = typeof doc.extracted_data === 'string' ? JSON.parse(doc.extracted_data) : doc.extracted_data;
        
        // Name check
        if (extractedFields.name && verifiedData.name) {
          const currentName = extractedFields.name.toLowerCase().replace(/[^a-z]/g, '');
          const verifiedName = verifiedData.name.toLowerCase().replace(/[^a-z]/g, '');
          // Very basic mismatch check (if they are completely different strings, e.g. "Rahul" vs "Amit")
          if (currentName.length > 3 && verifiedName.length > 3 && !currentName.includes(verifiedName) && !verifiedName.includes(currentName)) {
            contradictions.push(`Name mismatch with verified ${getDocumentLabel(doc.document_type)}`);
          }
        }
        
        // DOB check
        if (extractedFields.dob && verifiedData.dob) {
          if (extractedFields.dob !== verifiedData.dob) {
            contradictions.push(`Date of Birth mismatch with verified ${getDocumentLabel(doc.document_type)}`);
          }
        }
      }
    }
  }

  if (contradictions.length > 0) {
    return {
      pass: false,
      code: "CONTRADICTION",
      userMessage: `This document contains conflicting information (e.g. Name/DOB mismatch) for a ${label}. Our team needs to review this.`,
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
    // Missing data ≠ Fraud
    let missingFieldNames = issues.map(i => i.replace('_', ' ')).join(", ");
    return {
      pass: false,
      code: "MISSING_FIELDS",
      userMessage: `We couldn't clearly read the following required details: ${missingFieldNames}. Please ensure the full document is visible and not cropped.`,
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
