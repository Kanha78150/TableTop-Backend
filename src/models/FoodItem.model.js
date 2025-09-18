import mongoose from "mongoose";
import Joi from "joi";

const foodItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true },
    isAvailable: { type: Boolean, default: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "FoodCategory" },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    image: { type: String, default: null }, // food image (URL or path)
  },
  { timestamps: true }
);

export const FoodItem = mongoose.model("FoodItem", foodItemSchema);

export const validateFoodItem = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string().allow("").optional(),
    price: Joi.number().positive().required(),
    category: Joi.string().required(),
    branch: Joi.string().required(),
    image: Joi.string().uri().optional().allow(null, ""),
  });
  return schema.validate(data);
};
