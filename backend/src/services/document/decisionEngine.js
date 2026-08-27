/**
 * Decision Engine — Stage 7
 * Aggregates results from all stages and determines final verification outcome.
 * 
 * Rules:
 * 1. Wrong type / structurally invalid / unreadable / incomplete -> REJECTED
 * 2. Valid-looking document + genuinely ambiguous/minor inconsistency -> NEEDS_REVIEW (last resort)
 * 3. Valid document + required checks pass -> VERIFIED
 */

const { getDocumentLabel } = require("../documentRules");

/**
 * @param {object} params
 * @param {object} params.fieldValidation - result from fieldValidator
 * @param {object} params.fraudDetection - result from fraudDetector
 * @param {object} params.extractedFields - extracted field values
 * @param {string} params.documentType
 * @returns {{ status: string, userMessage: string, data: object }}
 */
function decide({ fieldValidation, fraudDetection, extractedFields, documentType }) {
  const label = getDocumentLabel(documentType);
  const signals = fraudDetection.data?.signals || [];
  const hasSuspiciousMetadata = fraudDetection.data?.isSuspiciousMetadata || false;
  const hasOfficialMarkers = fraudDetection.data?.hasOfficialMarkers || false;
  const hasDigitalSignature = fraudDetection.data?.hasDigitalSignature || false;
  const hasVisualTampering = fraudDetection.data?.hasVisualTampering || false;
  const hasDuplicate = signals.some(s => s.type === "duplicate");

  const fieldResults = fieldValidation.data?.validationResults || {};
  const contradictions = fieldValidation.data?.contradictions || [];

  // ─── 1. REJECT / REUPLOAD (Structural, Type, Field, or Fraud Failures) ───

  // A. Clearly forged (word processor metadata with no official markers)
  if (hasSuspiciousMetadata && !hasOfficialMarkers && !hasDigitalSignature) {
    return {
      status: "rejected_forged",
      userMessage: `This document doesn't appear to be an official ${label}. Please upload the original official document.`,
      data: { reason: "Suspicious word processor metadata without official markers", signals, fieldResults }
    };
  }

  // B. Required fields missing or failed format validation -> REJECT
  if (!fieldValidation.pass && fieldValidation.code !== "CONTRADICTION") {
    return {
      status: "rejected",
      userMessage: fieldValidation.userMessage || `This doesn't appear to be a valid ${label}. Please upload the correct document.`,
      data: { reason: "Required document fields missing or invalid format", fieldResults, signals }
    };
  }

  // C. Empty extracted fields
  if (!extractedFields || Object.keys(extractedFields).length === 0) {
    return {
      status: "rejected",
      userMessage: `This doesn't appear to be a valid ${label}. Please upload the correct document.`,
      data: { reason: "No valid fields could be extracted", signals }
    };
  }

  // ─── 2. ADMIN REVIEW (Last-resort for genuinely ambiguous valid-looking documents) ───

  // A. Contradictions (e.g. Name/DOB mismatch across documents)
  if (contradictions.length > 0) {
    return {
      status: "manual_review_required",
      userMessage: fieldValidation.userMessage || `This document contains conflicting information. Our team needs to review this.`,
      data: { reason: "Consistency contradiction detected", signals, contradictions }
    };
  }

  // B. Visual Tampering detected by AI
  if (hasVisualTampering) {
    return {
      status: "manual_review_required",
      userMessage: "This document requires additional verification by our team.",
      data: { reason: "AI detected possible visual tampering", signals }
    };
  }

  // C. Duplicate verified document for the same user
  if (hasDuplicate) {
    return {
      status: "manual_review_required",
      userMessage: `A ${label} has already been verified for your profile. Our team will review this new upload.`,
      data: { reason: "Duplicate verified document uploaded", signals }
    };
  }

  // D. Suspicious tool metadata BUT official markers/signatures ARE present (ambiguous)
  if (hasSuspiciousMetadata && (hasOfficialMarkers || hasDigitalSignature)) {
    return {
      status: "manual_review_required",
      userMessage: "We need to take a closer look at this document. Your document has been sent for review.",
      data: { reason: "Word processor metadata present despite official markers", signals }
    };
  }

  // ─── 3. VERIFIED (Valid document + required checks pass) ───
  return {
    status: "verified",
    userMessage: `Your ${label} passed GovAssist's document and consistency checks.`,
    data: { reason: "All checks passed", signals, fieldResults }
  };
}

module.exports = { decide };
