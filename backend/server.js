const express = require("express");
const cors = require("cors");
const { errorHandlerMiddleware } = require("./src/middleware/errorHandler");

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());

// ============================================
// ROUTES
// ============================================

const authRoutes = require("./src/routes/authRoutes");
const schemeRoutes = require("./src/routes/schemeRoutes");
const recommendationRoutes = require("./src/routes/recommendationRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const documentRoutes = require("./src/routes/documentRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const chatRoutes = require("./src/routes/chatRoutes");

// ============================================
// API ROUTES
// ============================================

app.use("/api/auth", authRoutes);
app.use("/api/schemes", schemeRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);

// ============================================
// HEALTH CHECK
// ============================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "GovAssist API is running",
  });
});

// ============================================
// ERROR HANDLER (Must be registered last)
// ============================================

app.use(errorHandlerMiddleware);

// ============================================
// SERVER
// ============================================

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;