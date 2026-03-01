import mongoose from "mongoose";

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

// Validators extracted to src/validators/transaction.validators.js
export { validateTransaction } from "../validators/transaction.validators.js";
