// src/middleware/accounting.validation.middleware.js - Accounting Validation Middleware
import { APIError } from "../utils/APIError.js";
import Joi from "joi";

// Define validation schemas directly in this file to avoid import issues
const validateTransactionQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  hotelId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  branchId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  status: Joi.string()
    .valid(
      "pending",
      "completed",
      "failed",
      "cancelled",
      "paid",
      "refund_pending",
      "refunded"
    )
    .optional(),
  paymentMethod: Joi.string()
    .valid("cash", "card", "upi", "wallet", "razorpay")
    .optional(),
  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  minAmount: Joi.number().min(0).optional(),
  maxAmount: Joi.number().min(Joi.ref("minAmount")).optional(),
  sortBy: Joi.string()
    .valid("createdAt", "amount", "status")
    .default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const validateHotelAccountingQuery = Joi.object({
  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: Joi.string()
    .valid("pending", "completed", "failed", "cancelled")
    .default("completed"),
});

const validateBranchAccountingQuery = Joi.object({
  hotelId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: Joi.string()
    .valid("pending", "completed", "failed", "cancelled")
    .default("completed"),
});

const validateSettlementQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  hotelId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  branchId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  status: Joi.string()
    .valid("pending", "completed", "failed", "cancelled")
    .optional(),
  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  payoutStatus: Joi.string()
    .valid("all", "pending", "processing", "settled")
    .default("all"),
});

const validateExportRequest = Joi.object({
  format: Joi.string().valid("csv", "excel", "pdf").required(),
  reportType: Joi.string()
    .valid("transactions", "hotels", "branches", "settlements")
    .required(),
  hotelId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  branchId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: Joi.string()
    .valid("pending", "completed", "failed", "cancelled")
    .optional(),
});

const validateDashboardQuery = Joi.object({
  period: Joi.string().valid("1d", "7d", "30d", "90d", "1y").default("30d"),
  hotelId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  branchId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
});

const validateSummaryQuery = Joi.object({
  period: Joi.string().valid("1d", "7d", "30d", "90d", "1y").default("30d"),
});

// Date range validation helper
const validateDateRange = (startDate, endDate) => {
  try {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Invalid date format provided");
      }

      if (start > end) {
        throw new Error("Start date must be before end date");
      }

      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 365) {
        throw new Error("Date range cannot exceed 365 days");
      }
    }
    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Validation middleware factory
 */
const createValidationMiddleware = (schema, source = "query") => {
  return (req, res, next) => {
    try {
      const data = source === "body" ? req.body : req.query;

      // Check if schema is provided
      if (!schema) {
        console.error("No validation schema provided");
        return next(new APIError(500, "Validation configuration error"));
      }

      // Validate with Joi schema
      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      });

      if (error) {
        const errorMessages = error.details.map((detail) => detail.message);
        return next(
          new APIError(400, `Validation error: ${errorMessages.join(", ")}`)
        );
      }

      // Store validated data
      if (source === "body") {
        req.body = value;
      } else {
        // Store validated query parameters in a new property
        // since req.query is read-only in newer Express versions
        req.validatedQuery = value;

        // Also ensure req.query has the validated values for backward compatibility
        // We'll override individual properties safely
        try {
          Object.keys(value).forEach((key) => {
            req.query[key] = value[key];
          });
        } catch (queryError) {
          // If we can't modify req.query, just use req.validatedQuery
        }
      }

      // Additional date range validation - only if both dates exist
      if (value && value.startDate && value.endDate) {
        try {
          validateDateRange(value.startDate, value.endDate);
        } catch (dateError) {
          console.error("Date range validation error:", dateError);
          return next(new APIError(400, dateError.message));
        }
      }

      next();
    } catch (error) {
      console.error("Validation middleware unexpected error:", error);
      console.error("Error stack:", error.stack);
      next(new APIError(500, `Validation middleware error: ${error.message}`));
    }
  };
};

/**
 * Transaction query validation middleware
 */
export const validateTransactionQueryMiddleware = createValidationMiddleware(
  validateTransactionQuery
);

/**
 * Hotel accounting query validation middleware
 */
export const validateHotelAccountingQueryMiddleware =
  createValidationMiddleware(validateHotelAccountingQuery);

/**
 * Branch accounting query validation middleware
 */
export const validateBranchAccountingQueryMiddleware =
  createValidationMiddleware(validateBranchAccountingQuery);

/**
 * Settlement query validation middleware
 */
export const validateSettlementQueryMiddleware = createValidationMiddleware(
  validateSettlementQuery
);

/**
 * Export request validation middleware
 */
export const validateExportRequestMiddleware = createValidationMiddleware(
  validateExportRequest,
  "body"
);

/**
 * Dashboard query validation middleware
 */
export const validateDashboardQueryMiddleware = createValidationMiddleware(
  validateDashboardQuery
);

/**
 * Summary query validation middleware
 */
export const validateSummaryQueryMiddleware =
  createValidationMiddleware(validateSummaryQuery);

/**
 * Generic parameter validation for MongoDB ObjectIds
 */
export const validateObjectIdParam = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (id && !/^[0-9a-fA-F]{24}$/.test(id)) {
      return next(new APIError(400, `Invalid ${paramName} format`));
    }
    next();
  };
};

/**
 * Rate limiting for export operations
 */
export const exportRateLimit = (req, res, next) => {
  // Simple in-memory rate limiting for exports
  // In production, use Redis or similar
  const userExports = global.exportAttempts || {};
  const userId = req.user._id.toString();
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  if (!userExports[userId]) {
    userExports[userId] = [];
  }

  // Clean old attempts
  userExports[userId] = userExports[userId].filter(
    (time) => now - time < oneHour
  );

  // Check rate limit (max 10 exports per hour)
  if (userExports[userId].length >= 10) {
    return next(
      new APIError(
        429,
        "Export rate limit exceeded. Maximum 10 exports per hour."
      )
    );
  }

  // Add current attempt
  userExports[userId].push(now);
  global.exportAttempts = userExports;

  next();
};

export default {
  validateTransactionQueryMiddleware,
  validateHotelAccountingQueryMiddleware,
  validateBranchAccountingQueryMiddleware,
  validateSettlementQueryMiddleware,
  validateExportRequestMiddleware,
  validateDashboardQueryMiddleware,
  validateSummaryQueryMiddleware,
  validateObjectIdParam,
  exportRateLimit,
};
