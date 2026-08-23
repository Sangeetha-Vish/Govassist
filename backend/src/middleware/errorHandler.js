class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = this.constructor.name;
  }
}

class ValidationError extends AppError {
  constructor(message = "Validation Failed", details = null) {
    super(message, 400, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized Access") {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Forbidden Access") {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Resource Not Found") {
    super(message, 404);
  }
}

function errorHandlerMiddleware(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    error: {
      message: err.message || "Internal Server Error",
    },
  };

  if (err.details) {
    response.error.details = err.details;
  }

  if (statusCode === 500) {
    response.error.message = "An unexpected server error occurred. Please try again later.";
  }

  if (process.env.NODE_ENV === "development" && err.stack && statusCode !== 500) {
    response.error.stack = err.stack;
  }

  console.error(`[API Error] ${statusCode} - ${err.message}`, err.stack || "");
  res.status(statusCode).json(response);
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  errorHandlerMiddleware,
};
