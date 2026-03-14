import mongoose from "mongoose";

const rewardHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "RewardTask" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    coins: { type: Number, required: true },
    type: { type: String, enum: ["task", "order"], required: true },
  },
  { timestamps: true }
);

export const RewardHistory = mongoose.model(
  "RewardHistory",
  rewardHistorySchema
);

// Validators extracted to src/validators/rewardhistory.validators.js
export { validateRewardHistory } from "../validators/rewardhistory.validators.js";
