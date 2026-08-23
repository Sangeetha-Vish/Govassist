const express = require("express");
const router = express.Router();
const { verifyAdminToken } = require("../middleware/authMiddleware");

const {
  getAllSchemes,
  getSchemeById,
  createScheme,
  updateScheme,
  setSchemeStatus,
  deleteScheme,
  filterSchemes,
} = require("../controllers/schemeController");

// Public endpoints (or consumed by recommendation engine)
router.get("/", getAllSchemes);
router.get("/:id", getSchemeById);
router.post("/filter", filterSchemes);

// Secure Admin-only endpoints
router.post("/", verifyAdminToken, createScheme);
router.put("/:id", verifyAdminToken, updateScheme);
router.patch("/:id/status", verifyAdminToken, setSchemeStatus);
router.delete("/:id", verifyAdminToken, deleteScheme);

module.exports = router;