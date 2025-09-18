import mongoose from "mongoose";
import Joi from "joi";

const offerSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, required: true },
    description: { type: String, default: "" },
    discountType: { type: String, enum: ["flat", "percent"], required: true },
    discountValue: { type: Number, required: true },
    minOrderValue: { type: Number, default: 0 },
    expiryDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Offer = mongoose.model("Offer", offerSchema);

export const validateOffer = (data) => {
  const schema = Joi.object({
    code: Joi.string().required(),
    description: Joi.string().allow(""),
    discountType: Joi.string().valid("flat", "percent").required(),
    discountValue: Joi.number().positive().required(),
    minOrderValue: Joi.number().min(0),
    expiryDate: Joi.date().greater("now").required(),
  });
  return schema.validate(data);
};
