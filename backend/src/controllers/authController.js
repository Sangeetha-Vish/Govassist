const { generateAdminToken } = require("../middleware/authMiddleware");
const { ValidationError, UnauthorizedError } = require("../middleware/errorHandler");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "govassist2026";

async function loginAdmin(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new ValidationError("Username and password are required");
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      throw new UnauthorizedError("Invalid admin credentials");
    }

    const token = generateAdminToken({ id: "admin_1", username: ADMIN_USERNAME });

    res.status(200).json({
      success: true,
      message: "Admin authentication successful",
      token,
      admin: {
        username: ADMIN_USERNAME,
        role: "admin",
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  loginAdmin,
};
