import mongoose from "mongoose";
import Joi from "joi";

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    hotel: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel" },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    amount: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: [
        "cash",
        "card",
        "upi",
        "wallet",
        "razorpay",
        "phonepe",
        "paytm",
        "netbanking",
        "paylater",
      ],
      default: "cash",
    },
    provider: {
      type: String,
      enum: ["razorpay", "phonepe", "paytm", "cash"],
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "refunded"],
      default: "pending",
    },
    transactionId: { type: String, unique: true },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model("Transaction", transactionSchema);

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
