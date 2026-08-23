/**
 * Field Extractor — Stage 4
 * Runs document-type-specific field extractors from documentRules config.
 */

const { DOCUMENT_RULES, getDocumentLabel } = require("../documentRules");

function extract(text, documentType) {
  const rules = DOCUMENT_RULES[documentType];
  if (!rules) {
    return {
      pass: false,
      code: "UNKNOWN_TYPE",
      userMessage: "An unexpected error occurred. Please try again.",
      data: {}
    };
  }

  const extracted = {};
  const extractionLog = {};

  for (const [fieldName, extractorFn] of Object.entries(rules.fieldExtractors)) {
    try {
      const value = extractorFn(text);
      extracted[fieldName] = value;
      extractionLog[fieldName] = value ? "found" : "not_found";
    } catch (err) {
      extracted[fieldName] = null;
      extractionLog[fieldName] = "error";
    }
  }

  return {
    pass: true,
    code: "OK",
    data: { extracted, extractionLog }
  };
}

module.exports = { extract };
