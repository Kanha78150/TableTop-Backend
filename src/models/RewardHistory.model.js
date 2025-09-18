import mongoose from "mongoose";
import Joi from "joi";

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

export const validateRewardHistory = (data) => {
  const schema = Joi.object({
    user: Joi.string().required(),
    coins: Joi.number().required(),
    type: Joi.string().valid("task", "order").required(),
  });
  return schema.validate(data);
};
