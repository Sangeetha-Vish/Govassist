const profileService = require("../services/profileService");
const { validateAndNormalizeProfile } = require("../middleware/profileValidator");
const { ValidationError } = require("../middleware/errorHandler");

async function createOrUpdateProfile(req, res, next) {
  try {
    const { isValid, errors, normalized } = validateAndNormalizeProfile(req.body);

    if (!normalized.user_id) {
      errors.push("`user_id` is required for saving profile.");
    }

    if (!isValid || errors.length > 0) {
      throw new ValidationError("Invalid profile input", errors);
    }

    const result = await profileService.createOrUpdateProfile(normalized.user_id, normalized);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrUpdateProfile,
};