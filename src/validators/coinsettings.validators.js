import Joi from "joi";

export const coinSettingsValidationSchemas = {
  create: Joi.object({
    minimumOrderValue: Joi.number().min(0).required(),
    coinValue: Joi.number().min(0.01).required(),
    coinsPerRupee: Joi.number().min(0).max(50).required(),
    maxCoinsPerOrder: Joi.number().min(0).required(),
    maxCoinUsagePercent: Joi.number().min(0).max(100).required(),
    coinExpiryDays: Joi.number().min(0).required(),
    isActive: Joi.boolean().optional().default(true),
    reason: Joi.string().max(500).optional(),
  }),

  update: Joi.object({
    minimumOrderValue: Joi.number().min(0).optional(),
    coinValue: Joi.number().min(0.01).optional(),
    coinsPerRupee: Joi.number().min(0).max(50).optional(),
    maxCoinsPerOrder: Joi.number().min(0).optional(),
    maxCoinUsagePercent: Joi.number().min(0).max(100).optional(),
    coinExpiryDays: Joi.number().min(0).optional(),
    isActive: Joi.boolean().optional(),
    reason: Joi.string().max(500).optional(),
  }),
};

