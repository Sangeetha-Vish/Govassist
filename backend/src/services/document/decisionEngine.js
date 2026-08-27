/**
 * Decision Engine — Stage 8
 * Aggregates results from all stages and determines final verification outcome.
 *
 * Thresholds (conceptual):
 *   0–94% relevance match → REJECT  (wrong type, non-document, unreadable, missing fields)
 *  95–99% relevance + genuine auth uncertainty → ADMIN REVIEW (last resort)
 * 100% clean → VERIFIED
 *
 * Admin Review is ONLY for documents that:
 *   - Are clearly the correct document type
 *   - Have all required fields present and passing
 *   - But have an unresolved authenticity/tampering signal that
 *     cannot be deterministically resolved by the system
 */

const { getDocumentLabel } = require("../documentRules");

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

  // ─── TIER 1: HARD REJECT ───
  // These never go to Admin. User must fix and re-upload.

  // A. Clearly forged (word-processor tool metadata + zero official markers)
  if (hasSuspiciousMetadata && !hasOfficialMarkers && !hasDigitalSignature) {
    return {
      status: "rejected",
      userMessage: `This document doesn't appear to be an official ${label}. It seems to have been created with a word processor rather than issued by a government authority. Please upload the original official document.`,
      data: { reason: "Suspicious creator metadata with no official markers", signals, fieldResults }
    };
  }

  // B. Required fields missing or failed format validation
  //    Missing data ≠ Fraud. But it IS a rejection — the document is incomplete/unreadable.
  if (!fieldValidation.pass && fieldValidation.code !== "CONTRADICTION") {
    return {
      status: "rejected",
      userMessage: fieldValidation.userMessage ||
        `We couldn't read all the required information from this ${label}. Please upload a complete, clearly visible document.`,
      data: { reason: "Required fields missing or invalid format", fieldResults, signals }
    };
  }

  // C. Empty extracted fields (no meaningful content at all)
  if (!extractedFields || Object.keys(extractedFields).filter(k => extractedFields[k]).length === 0) {
    return {
      status: "rejected",
      userMessage: `We couldn't extract any information from this ${label}. Please upload a complete, clearly visible document.`,
      data: { reason: "No valid fields could be extracted", signals }
    };
  }

  // D. Name/DOB cross-document contradiction → REJECT (user should clarify with correct doc)
  if (contradictions.length > 0) {
    return {
      status: "rejected",
      userMessage: fieldValidation.userMessage ||
        `The name or date of birth on this ${label} conflicts with your previously verified documents. Please upload the correct document.`,
      data: { reason: "Cross-document contradiction", signals, contradictions }
    };
  }

  // ─── TIER 2: ADMIN REVIEW (LAST RESORT ONLY) ───
  // Only reaches here if the document IS structurally valid, fields ARE present,
  // but there is a genuine authenticity concern the system cannot resolve.

  // E. AI detected visual tampering AND official markers are present (ambiguous — could be genuine)
  if (hasVisualTampering && hasOfficialMarkers) {
    return {
      status: "manual_review_required",
      userMessage: "Your document looks official but our system detected some irregularities that need a human review. Our team will verify it shortly.",
      data: { reason: "Visual tampering signals with official markers present", signals }
    };
  }

  // F. Suspicious creator tool + official markers/signature ARE both present (ambiguous edge case)
  if (hasSuspiciousMetadata && (hasOfficialMarkers || hasDigitalSignature)) {
    return {
      status: "manual_review_required",
      userMessage: "Our automated system flagged a minor concern on this document. Our team will verify it and update you shortly.",
      data: { reason: "Word processor metadata with official markers — ambiguous", signals }
    };
  }

  // G. Duplicate verified document for the same user
  if (hasDuplicate) {
    return {
      status: "manual_review_required",
      userMessage: `A ${label} has already been verified for your profile. Our team will review this new upload to ensure accuracy.`,
      data: { reason: "Duplicate verified document", signals }
    };
  }

  // ─── TIER 3: VERIFIED ───
  return {
    status: "verified",
    userMessage: `Your ${label} has been verified successfully.`,
    data: { reason: "All checks passed", signals, fieldResults }
  };
}

module.exports = { decide };
