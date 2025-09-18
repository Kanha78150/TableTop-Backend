import mongoose from "mongoose";
import Joi from "joi";

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

export const validateRewardTask = (data) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().allow(""),
    coins: Joi.number().positive().required(),
  });
  return schema.validate(data);
};
