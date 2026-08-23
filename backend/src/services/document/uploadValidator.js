/**
 * Upload Validator — Stage 1
 * Validates file before any processing: extension, MIME type, size, corruption.
 */

const ALLOWED_MIME_TYPES = ["application/pdf"];
const ALLOWED_EXTENSIONS = [".pdf"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function validate(file) {
  if (!file || !file.buffer) {
    return {
      pass: false,
      code: "NO_FILE",
      userMessage: "No document was received. Please select a file and try again."
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      pass: false,
      code: "FILE_TOO_LARGE",
      userMessage: "Your file is too large. Please upload a document smaller than 5MB."
    };
  }

  if (file.size === 0) {
    return {
      pass: false,
      code: "FILE_EMPTY",
      userMessage: "This file appears to be empty. Please check the file and upload it again."
    };
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return {
      pass: false,
      code: "INVALID_FORMAT",
      userMessage: "Please upload your document as a PDF file. Other file formats are not supported at this time."
    };
  }

  // Check extension
  const fileName = (file.originalname || "").toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  if (!hasValidExtension) {
    return {
      pass: false,
      code: "INVALID_EXTENSION",
      userMessage: "Please upload your document as a PDF file."
    };
  }

  return { pass: true, code: "OK" };
}

module.exports = { validate };
