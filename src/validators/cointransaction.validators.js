import Joi from "joi";

export const coinTransactionValidationSchemas = {
  create: Joi.object({
    userId: Joi.string().hex().length(24).required(),
    type: Joi.string()
      .valid("earned", "used", "refunded", "expired", "adjusted")
      .required(),
    amount: Joi.number().required(),
    orderId: Joi.string().hex().length(24).optional(),
    description: Joi.string().max(200).required(),
    metadata: Joi.object().optional(),
    adjustedBy: Joi.string().hex().length(24).optional(),
    refundRequestId: Joi.string().hex().length(24).optional(),
  }),

  getUserHistory: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    type: Joi.string()
      .valid("earned", "used", "refunded", "expired", "adjusted")
      .optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
  }),
};

