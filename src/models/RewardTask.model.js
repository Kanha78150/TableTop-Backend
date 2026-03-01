import mongoose from "mongoose";

const rewardTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    coins: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const RewardTask = mongoose.model("RewardTask", rewardTaskSchema);

// Validators extracted to src/validators/rewardtask.validators.js
export { validateRewardTask } from "../validators/rewardtask.validators.js";
