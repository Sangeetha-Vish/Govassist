const express = require("express");

const router = express.Router();

const {
  getRecommendations,
} = require("../controllers/recommendationController");

// POST /api/recommendations
router.post("/", getRecommendations);

module.exports = router;