import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";

const isDev = process.env.NODE_ENV === "development";

export const errorHandler = (err, req, res, next) => {
  // Structured error logging with request context
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
    name: err.name,
    statusCode: err.statusCode,
    stack: isDev ? err.stack : undefined,
  });

  // Handle APIError instances
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.error || null,
      ...(isDev && { stack: err.stack }),
    });
  }

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors,
    });
  }

  // Handle Mongoose CastError (invalid ObjectId, etc.)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
    });
  }

  // Handle Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired",
    });
  }

  // Handle Multer errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File too large",
    });
  }

  // Handle PayloadTooLargeError (body-parser)
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request payload too large",
    });
  }

  // Handle SyntaxError (malformed JSON body)
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON in request body",
    });
  }

  // Default error
  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    ...(isDev && { stack: err.stack }),
  });
};

// Async error wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
