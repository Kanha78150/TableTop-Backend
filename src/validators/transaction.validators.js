import Joi from "joi";

export const validateTransaction = (data) => {
  const schema = Joi.object({
    user: Joi.string().required(),
    order: Joi.string().required(),
    amount: Joi.number().positive().required(),
    paymentMethod: Joi.string()
      .valid(
        "cash",
        "card",
        "upi",
        "wallet",
        "razorpay",
        "phonepe",
        "paytm",
        "netbanking",
        "paylater"
      )
      .required(),
  });
  return schema.validate(data);
};

