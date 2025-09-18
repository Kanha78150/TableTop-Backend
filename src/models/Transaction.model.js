import mongoose from "mongoose";
import Joi from "joi";

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    amount: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["upi", "card", "wallet", "cod"],
      default: "upi",
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
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
      .valid("upi", "card", "wallet", "cod")
      .required(),
  });
  return schema.validate(data);
};
