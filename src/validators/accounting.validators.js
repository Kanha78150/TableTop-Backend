// src/validators/accounting.validators.js - Accounting Validation Schemas
import Joi from "joi";

/**
 * Transaction query validation
 */
export const validateTransactionQuery = Joi.object({
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
  paymentMethod: Joi.string()
    .valid("card", "upi", "wallet", "cash", "netbanking")
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

/**
 * Hotel-wise accounting query validation
 */
export const validateHotelAccountingQuery = Joi.object({
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

/**
 * Branch-wise accounting query validation
 */
export const validateBranchAccountingQuery = Joi.object({
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

/**
 * Settlement query validation
 */
export const validateSettlementQuery = Joi.object({
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

/**
 * Export report validation
 */
export const validateExportRequest = Joi.object({
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

/**
 * Dashboard query validation
 */
export const validateDashboardQuery = Joi.object({
  period: Joi.string().valid("1d", "7d", "30d", "90d", "1y").default("30d"),
  hotelId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  branchId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
});

/**
 * Financial summary query validation
 */
export const validateSummaryQuery = Joi.object({
  period: Joi.string().valid("1d", "7d", "30d", "90d", "1y").default("30d"),
});

/**
 * Date range validation helper
 */
export const validateDateRange = (startDate, endDate) => {
  try {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Check if dates are valid
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Invalid date format provided");
      }

      // Check if start date is before end date
      if (start > end) {
        throw new Error("Start date must be before end date");
      }

      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Limit date range to 1 year for performance
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
 * MongoDB ObjectId validation helper
 */
export const validateObjectId = (id, fieldName = "id") => {
  const objectIdPattern = /^[0-9a-fA-F]{24}$/;
  if (!objectIdPattern.test(id)) {
    throw new Error(`Invalid ${fieldName} format`);
  }
  return true;
};

export default {
  validateTransactionQuery,
  validateHotelAccountingQuery,
  validateBranchAccountingQuery,
  validateSettlementQuery,
  validateExportRequest,
  validateDashboardQuery,
  validateSummaryQuery,
  validateDateRange,
  validateObjectId,
};
