/**
 * Quality Checker — Stage 2
 * Checks PDF page count, text density, and readability.
 */

const MIN_TEXT_LENGTH = 20;
const MAX_PAGES = 10;

function check(pdfData) {
  const text = pdfData.text || "";
  const numPages = pdfData.numpages || 0;
  const textLength = text.trim().length;

  // Zero pages — corrupt or unreadable
  if (numPages === 0) {
    return {
      pass: false,
      code: "CORRUPT_PDF",
      userMessage: "We couldn't open this document. Please check the file and upload it again."
    };
  }

  // Too many pages — likely not a single document
  if (numPages > MAX_PAGES) {
    return {
      pass: false,
      code: "TOO_MANY_PAGES",
      userMessage: "This file has too many pages. Please upload only the relevant document pages."
    };
  }

  // Blank or nearly blank
  if (textLength < MIN_TEXT_LENGTH) {
    return {
      pass: false,
      code: "UNREADABLE",
      userMessage: "We couldn't clearly read this document. Please upload a clearer copy."
    };
  }

  // Very low text density per page — likely blurry or cropped
  const densityPerPage = textLength / numPages;
  if (densityPerPage < 15) {
    return {
      pass: false,
      code: "LOW_DENSITY",
      userMessage: "This document appears incomplete or cropped. Please upload a full, clear copy."
    };
  }

  return {
    pass: true,
    code: "OK",
    data: { numPages, textLength, densityPerPage: Math.round(densityPerPage) }
  };
}

module.exports = { check };
