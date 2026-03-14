import Joi from "joi";

export const tableValidationSchemas = {
  createTable: Joi.object({
    tableNumber: Joi.string().required().messages({
      "any.required": "Table number is required",
      "string.empty": "Table number cannot be empty",
    }),
    hotel: Joi.string().length(24).hex().required().messages({
      "any.required": "Hotel ID is required",
      "string.length": "Hotel ID must be 24 characters",
      "string.hex": "Hotel ID must be valid",
    }),
    branch: Joi.string().length(24).hex().optional().messages({
      "string.length": "Branch ID must be 24 characters",
      "string.hex": "Branch ID must be valid",
    }),
    capacity: Joi.number().integer().min(1).max(20).required().messages({
      "any.required": "Table capacity is required",
      "number.min": "Capacity must be at least 1",
      "number.max": "Capacity cannot exceed 20",
    }),
    notes: Joi.string().max(500).optional().messages({
      "string.max": "Notes cannot exceed 500 characters",
    }),
  }),

  generateQRBulk: Joi.object({
    hotel: Joi.string().length(24).hex().required().messages({
      "any.required": "Hotel ID is required",
      "string.length": "Hotel ID must be 24 characters",
      "string.hex": "Hotel ID must be valid",
    }),
    branch: Joi.string().length(24).hex().optional().messages({
      "string.length": "Branch ID must be 24 characters",
      "string.hex": "Branch ID must be valid",
    }),
    totalTables: Joi.number().integer().min(1).max(100).required().messages({
      "any.required": "Total tables count is required",
      "number.min": "Must generate at least 1 table",
      "number.max": "Cannot generate more than 100 tables at once",
    }),
    startingNumber: Joi.number().integer().min(1).default(1).messages({
      "number.min": "Starting number must be at least 1",
    }),
    capacity: Joi.number().integer().min(1).max(20).default(4).messages({
      "number.min": "Capacity must be at least 1",
      "number.max": "Capacity cannot exceed 20",
    }),
  }),

  qrScan: Joi.object({
    hotelId: Joi.string().length(24).hex().required().messages({
      "any.required": "Hotel ID is required",
      "string.length": "Hotel ID must be 24 characters",
      "string.hex": "Hotel ID must be valid",
    }),
    branchId: Joi.string()
      .length(24)
      .hex()
      .optional()
      .allow(null, "")
      .messages({
        "string.length": "Branch ID must be 24 characters",
        "string.hex": "Branch ID must be valid",
      }),
    tableNo: Joi.string().required().messages({
      "any.required": "Table number is required",
      "string.empty": "Table number cannot be empty",
    }),
  }),
};

// Legacy validation functions for backward compatibility
export const validateTable = (data) => {
  return tableValidationSchemas.createTable.validate(data);
};

export const validateQRGeneration = (data) => {
  return tableValidationSchemas.generateQRBulk.validate(data);
};

export const validateQRScan = (data) => {
  return tableValidationSchemas.qrScan.validate(data);
};

