import Joi from "joi";

export const validateCreateReview = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().length(24).hex().required().messages({
      "string.length": "Order ID must be 24 characters",
      "string.hex": "Order ID must be valid",
      "any.required": "Order ID is required",
    }),
    foodRating: Joi.number().integer().min(1).max(5).required().messages({
      "number.min": "Food rating must be at least 1",
      "number.max": "Food rating cannot exceed 5",
      "any.required": "Food rating is required",
    }),
    hotelRating: Joi.number().integer().min(1).max(5).required().messages({
      "number.min": "Hotel rating must be at least 1",
      "number.max": "Hotel rating cannot exceed 5",
      "any.required": "Hotel rating is required",
    }),
    branchRating: Joi.number().integer().min(1).max(5).required().messages({
      "number.min": "Branch rating must be at least 1",
      "number.max": "Branch rating cannot exceed 5",
      "any.required": "Branch rating is required",
    }),
    staffRating: Joi.number().integer().min(1).max(5).required().messages({
      "number.min": "Staff rating must be at least 1",
      "number.max": "Staff rating cannot exceed 5",
      "any.required": "Staff rating is required",
    }),
    comment: Joi.string().max(1000).trim().optional().allow("").messages({
      "string.max": "Comment cannot exceed 1000 characters",
    }),
  });
  return schema.validate(data);
};

/**
 * Validate review update
 */
export const validateUpdateReview = (data) => {
  const schema = Joi.object({
    foodRating: Joi.number().integer().min(1).max(5).optional().messages({
      "number.min": "Food rating must be at least 1",
      "number.max": "Food rating cannot exceed 5",
    }),
    hotelRating: Joi.number().integer().min(1).max(5).optional().messages({
      "number.min": "Hotel rating must be at least 1",
      "number.max": "Hotel rating cannot exceed 5",
    }),
    branchRating: Joi.number().integer().min(1).max(5).optional().messages({
      "number.min": "Branch rating must be at least 1",
      "number.max": "Branch rating cannot exceed 5",
    }),
    staffRating: Joi.number().integer().min(1).max(5).optional().messages({
      "number.min": "Staff rating must be at least 1",
      "number.max": "Staff rating cannot exceed 5",
    }),
    comment: Joi.string().max(1000).trim().optional().allow("").messages({
      "string.max": "Comment cannot exceed 1000 characters",
    }),
  }).min(1); // At least one field must be provided
  return schema.validate(data);
};

/**
 * Validate helpful vote
 */
export const validateHelpfulVote = (data) => {
  const schema = Joi.object({
    helpful: Joi.boolean().required().messages({
      "any.required": "Helpful value is required",
      "boolean.base": "Helpful must be a boolean value",
    }),
  });
  return schema.validate(data);
};

/**
 * Validate admin response
 */
export const validateAdminResponse = (data) => {
  const schema = Joi.object({
    message: Joi.string().min(10).max(500).trim().required().messages({
      "string.min": "Response message must be at least 10 characters",
      "string.max": "Response message cannot exceed 500 characters",
      "any.required": "Response message is required",
    }),
  });
  return schema.validate(data);
};

/**
 * Validate rejection
 */
export const validateRejectReview = (data) => {
  const schema = Joi.object({
    rejectionReason: Joi.string().min(10).max(500).trim().required().messages({
      "string.min": "Rejection reason must be at least 10 characters",
      "string.max": "Rejection reason cannot exceed 500 characters",
      "any.required": "Rejection reason is required",
    }),
  });
  return schema.validate(data);
};

/**
 * Validate query parameters for getting reviews
 */
export const validateGetReviewsQuery = (data) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string()
      .valid("all", "pending", "approved", "rejected")
      .optional(),
    hotelId: Joi.string().length(24).hex().optional(),
    branchId: Joi.string().length(24).hex().optional(),
    minRating: Joi.number().min(1).max(5).optional(),
    maxRating: Joi.number().min(1).max(5).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    sortBy: Joi.string()
      .valid("createdAt", "overallRating", "helpfulCount")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
    search: Joi.string().optional(),
  });
  return schema.validate(data);
};

