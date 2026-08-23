/**
 * Fraud Detector — Stage 6
 * PDF metadata checks, official marker checks, duplicate detection.
 */

const { DOCUMENT_RULES } = require("../documentRules");

const SUSPICIOUS_CREATORS = ["microsoft word", "pages", "canva", "writer", "libreoffice", "google docs", "wps office"];

function detect(text, pdfInfo, documentType, existingDocs) {
  const textLower = text.toLowerCase();
  const rules = DOCUMENT_RULES[documentType];
  if (!rules) {
    return { pass: true, code: "OK", data: { signals: [] } };
  }

  const signals = [];

  // 1. Metadata check — suspicious creator tools
  const creator = (pdfInfo.Creator || "").toLowerCase();
  const producer = (pdfInfo.Producer || "").toLowerCase();
  let isSuspiciousMetadata = false;

  for (const tool of SUSPICIOUS_CREATORS) {
    if (creator.includes(tool) || producer.includes(tool)) {
      isSuspiciousMetadata = true;
      signals.push({
        type: "suspicious_metadata",
        detail: `PDF was created using "${pdfInfo.Creator || pdfInfo.Producer}" which is typically used for typing documents, not for official certificates.`
      });
      break;
    }
  }

  // 2. Official markers check
  let officialMarkerCount = 0;
  for (const marker of rules.officialMarkers) {
    if (textLower.includes(marker)) {
      officialMarkerCount++;
    }
  }
  const hasOfficialMarkers = officialMarkerCount >= 1;

  if (!hasOfficialMarkers) {
    signals.push({
      type: "missing_official_markers",
      detail: `No official government markers were found in this document.`
    });
  }

  // 3. Digital signature check
  const hasDigitalSignature = textLower.includes("digitally signed") || textLower.includes("digital signature");

  // 4. Duplicate detection — check if same document type already verified
  if (existingDocs && existingDocs.length > 0) {
    const alreadyVerified = existingDocs.find(
      d => d.document_type === documentType && d.verification_status === "verified"
    );
    if (alreadyVerified) {
      signals.push({
        type: "duplicate",
        detail: `A ${rules.label} has already been verified for this user.`
      });
    }
  }

  // Decision: high confidence fraud vs needs review vs clean
  if (isSuspiciousMetadata && !hasOfficialMarkers && !hasDigitalSignature) {
    return {
      pass: false,
      code: "LIKELY_FORGED",
      userMessage: "This document doesn't appear to be an official certificate. It may have been created using a word processor. Please upload the original official document.",
      data: { signals, isSuspiciousMetadata, hasOfficialMarkers, hasDigitalSignature, officialMarkerCount }
    };
  }

  return {
    pass: true,
    code: "OK",
    data: { signals, isSuspiciousMetadata, hasOfficialMarkers, hasDigitalSignature, officialMarkerCount }
  };
}

module.exports = { detect };
