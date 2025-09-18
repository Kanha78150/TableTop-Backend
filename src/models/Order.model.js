import mongoose from "mongoose";
import Joi from "joi";

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    table: { type: mongoose.Schema.Types.ObjectId, ref: "Table" },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    items: [
      {
        foodItem: { type: mongoose.Schema.Types.ObjectId, ref: "FoodItem" },
        quantity: { type: Number, default: 1 }, // need update
      },
    ],
    status: {
      type: String,
      enum: [
        "pending",
        "preparing",
        "ready",
        "served",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },
    estimatedTime: { type: Number },
    totalPrice: { type: Number, required: true },
    rewardCoins: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Order = mongoose.model("Order", orderSchema);

export const validateOrder = (data) => {
  const schema = Joi.object({
    user: Joi.string().required(),
    branch: Joi.string().required(),
    table: Joi.string().required(),
    items: Joi.array()
      .items(
        Joi.object({
          foodItem: Joi.string().required(),
          quantity: Joi.number().min(1).required(),
        })
      )
      .min(1)
      .required(),
    totalPrice: Joi.number().positive().required(),
  });
  return schema.validate(data);
};
