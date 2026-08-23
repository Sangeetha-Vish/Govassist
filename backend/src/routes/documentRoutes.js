const express = require("express");
const router = express.Router();
const multer = require("multer");
const documentController = require("../controllers/documentController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Handle multer errors (file too large) gracefully
function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(200).json({
        success: false,
        userMessage: "Your file is too large. Please upload a document smaller than 5MB.",
        code: "MULTER_LIMIT"
      });
    }
    return res.status(200).json({
      success: false,
      userMessage: "There was a problem with the upload. Please try again.",
      code: "MULTER_ERROR"
    });
  }
  next(err);
}

// Route to verify uploaded document
router.post(
  "/verify",
  (req, res, next) => {
    upload.single("document")(req, res, (err) => {
      if (err) return multerErrorHandler(err, req, res, next);
      next();
    });
  },
  documentController.verifyDocument
);

module.exports = router;
