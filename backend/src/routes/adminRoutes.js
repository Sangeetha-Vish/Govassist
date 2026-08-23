const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { verifyAdminToken } = require("../middleware/authMiddleware");

// All admin routes are protected by admin token
router.use(verifyAdminToken);

// Document Review Queue routes
router.get("/documents/pending", adminController.getPendingDocuments);
router.post("/documents/:documentId/review", adminController.reviewDocument);
router.get("/documents/:documentId/download", adminController.downloadDocument);

module.exports = router;
