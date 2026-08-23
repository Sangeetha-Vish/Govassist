const jwt = require("jsonwebtoken");
const { UnauthorizedError, ForbiddenError } = require("./errorHandler");

const JWT_SECRET = process.env.JWT_SECRET || "govassist_admin_secret_key_phase2_2026";

function generateAdminToken(adminPayload) {
  return jwt.sign(
    { id: adminPayload.id, username: adminPayload.username, role: "admin" },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function verifyAdminToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      throw new UnauthorizedError("Admin authentication token required");
    }
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "admin") {
      throw new ForbiddenError("Insufficient admin privileges");
    }

    req.admin = decoded;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      next(new UnauthorizedError("Invalid or expired admin token"));
    } else {
      next(error);
    }
  }
}

module.exports = {
  generateAdminToken,
  verifyAdminToken,
  JWT_SECRET,
};
