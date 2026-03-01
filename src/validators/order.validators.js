import Joi from "joi";

export const validateOrder = (data) => {
  const schema = Joi.object({
    user: Joi.string().length(24).hex().required(),
    hotel: Joi.string().length(24).hex().required(),
    branch: Joi.string().length(24).hex().optional().allow(null),
    table: Joi.string().length(24).hex().optional(),
    items: Joi.array()
      .items(
        Joi.object({
          foodItem: Joi.string().length(24).hex().required(),
          quantity: Joi.number().min(1).required(),
          price: Joi.number().min(0).required(),
          totalPrice: Joi.number().min(0).required(),
          customizations: Joi.object({
            spiceLevel: Joi.string().valid(
              "mild",
              "medium",
              "hot",
              "extra-hot"
            ),
            size: Joi.string().valid("small", "medium", "large", "extra-large"),
            addOns: Joi.array().items(
              Joi.object({
                name: Joi.string().required(),
                price: Joi.number().min(0).required(),
              })
            ),
            removedIngredients: Joi.array().items(Joi.string()),
            specialInstructions: Joi.string().max(200),
          }).optional(),
          foodItemName: Joi.string().required(),
          foodType: Joi.string().optional(),
          category: Joi.string().optional(),
        })
      )
      .min(1)
      .required(),
    subtotal: Joi.number().min(0).required(),
    taxes: Joi.number().min(0).optional(),
    serviceCharge: Joi.number().min(0).optional(),
    totalPrice: Joi.number().min(0).required(),
    payment: Joi.object({
      paymentMethod: Joi.string()
        .valid("cash", "card", "upi", "wallet", "razorpay")
        .optional(),
      paymentStatus: Joi.string()
        .valid(
          "pending",
          "paid",
          "failed",
          "refund_pending",
          "refunded",
          "cancelled"
        )
        .optional(),
      transactionId: Joi.string().optional(),
      gatewayTransactionId: Joi.string().optional(),
      razorpayOrderId: Joi.string().optional(),
      razorpayPaymentId: Joi.string().optional(),
      paidAt: Joi.date().optional(),
      gatewayResponse: Joi.object().optional(),
      refund: Joi.object({
        transactionId: Joi.string().optional(),
        amount: Joi.number().min(0).optional(),
        reason: Joi.string().optional(),
        initiatedAt: Joi.date().optional(),
        completedAt: Joi.date().optional(),
        gatewayResponse: Joi.object().optional(),
      }).optional(),
    }).optional(),
    specialInstructions: Joi.string().max(500).optional(),
    estimatedTime: Joi.number().min(1).optional(),
  });
  return schema.validate(data);
};

