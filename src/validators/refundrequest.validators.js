import Joi from "joi";

export const refundRequestValidationSchemas = {
  create: Joi.object({
    orderId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid order ID format",
      }),
    amount: Joi.number().positive().required().messages({
      "number.positive": "Refund amount must be positive",
    }),
    reason: Joi.string().min(10).max(500).required().messages({
      "string.min": "Reason must be at least 10 characters long",
      "string.max": "Reason cannot exceed 500 characters",
    }),
  }),

  updateStatus: Joi.object({
    status: Joi.string()
      .valid("approved", "rejected", "processed", "completed")
      .required(),
    adminNotes: Joi.string().max(1000).optional(),
  }),

  list: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string()
      .valid("pending", "approved", "rejected", "processed", "completed")
      .optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
  }),
};

