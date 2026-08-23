const express = require("express");

const router = express.Router();

const {
  createOrUpdateProfile,
} = require("../controllers/profileController");

router.post("/", createOrUpdateProfile);

module.exports = router;