import Joi from "joi";

export const validateSubscription = (data) => {
  const schema = Joi.object({
    admin: Joi.string().required().messages({
      "any.required": "Admin ID is required",
    }),
    plan: Joi.string().required().messages({
      "any.required": "Plan ID is required",
    }),
    billingCycle: Joi.string().valid("monthly", "yearly").required().messages({
      "any.only": "Billing cycle must be monthly or yearly",
      "any.required": "Billing cycle is required",
    }),
    startDate: Joi.date().required().messages({
      "any.required": "Start date is required",
    }),
    endDate: Joi.date().greater(Joi.ref("startDate")).required().messages({
      "date.greater": "End date must be after start date",
      "any.required": "End date is required",
    }),
    autoRenew: Joi.boolean().optional(),
  });
  return schema.validate(data);
};

// Validation schema for payment record
export const validatePayment = (data) => {
  const schema = Joi.object({
    amount: Joi.number().min(0).required().messages({
      "number.min": "Amount cannot be negative",
      "any.required": "Amount is required",
    }),
    transactionId: Joi.string().required().messages({
      "any.required": "Transaction ID is required",
    }),
    paymentMethod: Joi.string()
      .valid("razorpay", "stripe", "paypal", "bank_transfer", "other")
      .optional(),
    status: Joi.string()
      .valid("success", "failed", "pending", "refunded")
      .optional(),
    currency: Joi.string().optional(),
    invoiceUrl: Joi.string().uri().optional(),
    notes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

// Validation schema for selecting subscription plan
export const validatePlanSelection = (data) => {
  const schema = Joi.object({
    planId: Joi.string().required().messages({
      "any.required": "Plan ID is required",
    }),
    billingCycle: Joi.string().valid("monthly", "yearly").required().messages({
      "any.only": "Billing cycle must be monthly or yearly",
      "any.required": "Billing cycle is required",
    }),
  });
  return schema.validate(data);
};

// Validation schema for cancellation
export const validateCancellation = (data) => {
  const schema = Joi.object({
    reason: Joi.string().max(500).required().messages({
      "string.max": "Reason cannot exceed 500 characters",
      "any.required": "Cancellation reason is required",
    }),
  });
  return schema.validate(data);
};

