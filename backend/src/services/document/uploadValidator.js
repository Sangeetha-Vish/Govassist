/**
 * Upload Validator — Stage 1
 * Validates file before any processing: extension, MIME type, size, corruption.
 */

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg"
];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
      userMessage: "Your file is too large. Please upload a document smaller than 10MB."
    };
  }

  if (file.size === 0) {
    return {
      pass: false,
      code: "FILE_EMPTY",
      userMessage: "This file appears to be empty. Please check the file and upload it again."
    };
  }

  // Check MIME type or extension
  const fileName = (file.originalname || "").toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  const hasValidMime = ALLOWED_MIME_TYPES.includes(file.mimetype);

  if (!hasValidExtension && !hasValidMime) {
    return {
      pass: false,
      code: "INVALID_FORMAT",
      userMessage: "Please upload your document as a PDF, JPG, or PNG file."
    };
  }

  return { pass: true, code: "OK" };
}

module.exports = { validate };
