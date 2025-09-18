import mongoose from "mongoose";
import Joi from "joi";

const foodCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    image: { type: String, default: null }, // category image (URL or path)
  },
  { timestamps: true }
);

export const FoodCategory = mongoose.model("FoodCategory", foodCategorySchema);

export const validateFoodCategory = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    branch: Joi.string().required(),
    image: Joi.string().uri().optional().allow(null, ""),
  });
  return schema.validate(data);
};
