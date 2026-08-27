/**
 * Quality Checker — Stage 2
 * Checks PDF page count, text density, and AI-generated readability flags.
 */

const MIN_TEXT_LENGTH = 5;
const MAX_PAGES = 20;

function check(pdfData) {
  const text = (pdfData.text || "").trim();
  const numPages = pdfData.numpages || 1;
  const textLength = text.length;
  const aiMetadata = pdfData.aiMetadata || {};
  const quality = aiMetadata.quality || {};

  // 1. AI Quality Flags (Priority Checks)
  if (quality.is_unreadable) {
    return {
      pass: false,
      code: "UNREADABLE",
      userMessage: "This document is too dark, corrupted, or low-resolution to read. Please upload a clearer copy."
    };
  }

  if (quality.is_blurry) {
    return {
      pass: false,
      code: "LOW_DENSITY",
      userMessage: "This scan is too blurry to verify. Please upload a clearer copy."
    };
  }

  // 2. Physical Document Constraints
  if (numPages === 0) {
    return {
      pass: false,
      code: "CORRUPT_PDF",
      userMessage: "We couldn't open this document. Please check the file and upload it again."
    };
  }

  if (numPages > MAX_PAGES) {
    return {
      pass: false,
      code: "TOO_MANY_PAGES",
      userMessage: "This file has too many pages. Please upload only the relevant document pages."
    };
  }

  // 3. Density / Blank Document Check
  if (textLength < MIN_TEXT_LENGTH) {
    return {
      pass: false,
      code: "UNREADABLE",
      userMessage: "We couldn't find any readable text in this document. Please upload a clearer copy or an official scan."
    };
  }

  const densityPerPage = textLength / numPages;

  return {
    pass: true,
    code: "OK",
    data: { 
      numPages, 
      textLength, 
      densityPerPage: Math.round(densityPerPage),
      isLowDensity: densityPerPage < 15,
      language: quality.language || "unknown"
    }
  };
}

module.exports = { check };
