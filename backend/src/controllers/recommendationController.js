const recommendationService = require("../services/recommendationService");
const { validateAndNormalizeProfile } = require("../middleware/profileValidator");
const { ValidationError } = require("../middleware/errorHandler");

async function getRecommendations(req, res, next) {
  try {
    const { isValid, errors, normalized } = validateAndNormalizeProfile(req.body);

    if (!isValid) {
      throw new ValidationError("Invalid profile input", errors);
    }

    const recommendations = await recommendationService.getRecommendations(normalized);

    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRecommendations,
};