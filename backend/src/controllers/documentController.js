const documentService = require("../services/documentService");
const { getDocumentLabel, getValidDocumentTypes } = require("../services/documentRules");

/**
 * User-friendly error messages — maps internal codes to citizen language.
 * Used as fallback if the pipeline doesn't provide a userMessage.
 */
const USER_MESSAGES = {
  NO_FILE: "No document was received. Please select a file and try again.",
  FILE_TOO_LARGE: "Your file is too large. Please upload a document smaller than 5MB.",
  FILE_EMPTY: "This file appears to be empty. Please check the file and upload it again.",
  INVALID_FORMAT: "Please upload your document as a PDF file.",
  INVALID_EXTENSION: "Please upload your document as a PDF file.",
  INVALID_TYPE: "Please select a valid document type from the list.",
  PARSE_FAILED: "We couldn't open this document. Please check the file and upload it again.",
  CORRUPT_PDF: "We couldn't open this document. Please check the file and upload it again.",
  UNREADABLE: "We couldn't read the details in this document. Please upload a clearer scan or a text-based PDF.",
  LOW_DENSITY: "The document is too blurry or unclear to read. Please upload a higher quality scan.",
  TOO_MANY_PAGES: "This file has too many pages. Please upload only the relevant document pages.",
  WRONG_TYPE: "This doesn't appear to be the document type you selected. Please check your selection.",
  TYPE_MISMATCH: "This doesn't appear to be the document type you selected.",
  UNRECOGNIZED: "We couldn't identify this as a recognized document type.",
  MISSING_FIELDS: "We couldn't find some important information in this document.",
  MISSING_NAME: "We couldn't find the name on this document.",
  INVALID_PAN: "The PAN number could not be verified from this document.",
  INVALID_AADHAAR: "The Aadhaar number could not be verified from this document.",
  LIKELY_FORGED: "This document doesn't appear to be an official certificate.",
  INTERNAL_ERROR: "Something went wrong while checking your document. Please try again.",
  MULTER_LIMIT: "Your file is too large. Please upload a document smaller than 5MB."
};

function getUserMessage(code, fallback) {
  return fallback || USER_MESSAGES[code] || USER_MESSAGES.INTERNAL_ERROR;
}

exports.verifyDocument = async (req, res, next) => {
  try {
    const { documentType, userId } = req.body;
    const file = req.file;
    const authHeader = req.headers.authorization;

    // Basic request validation
    if (!file) {
      return res.status(200).json({
        success: false,
        userMessage: USER_MESSAGES.NO_FILE,
        code: "NO_FILE"
      });
    }

    if (!documentType || !getValidDocumentTypes().includes(documentType)) {
      return res.status(200).json({
        success: false,
        userMessage: USER_MESSAGES.INVALID_TYPE,
        code: "INVALID_TYPE"
      });
    }

    if (!userId) {
      return res.status(200).json({
        success: false,
        userMessage: USER_MESSAGES.INTERNAL_ERROR,
        code: "MISSING_USER"
      });
    }

    if (!authHeader) {
      return res.status(200).json({
        success: false,
        userMessage: USER_MESSAGES.INTERNAL_ERROR,
        code: "MISSING_AUTH"
      });
    }

    // Run the verification pipeline
    const result = await documentService.processDocument(userId, file, documentType, authHeader);

    // Always return 200 with structured response — never expose HTTP error codes to user
    return res.status(200).json({
      success: result.success,
      userMessage: getUserMessage(result.code, result.userMessage),
      code: result.code,
      data: result.document || null,
      stageResults: result.stageResults || null
    });

  } catch (error) {
    console.error("Document controller error:", error);
    // Never expose internal errors to user
    return res.status(200).json({
      success: false,
      userMessage: USER_MESSAGES.INTERNAL_ERROR,
      code: "INTERNAL_ERROR"
    });
  }
};
