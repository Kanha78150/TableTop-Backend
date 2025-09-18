import mongoose from "mongoose";
import Joi from "joi";

const inventorySchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    itemName: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    threshold: { type: Number, default: 5 },
  },
  { timestamps: true }
);

export const Inventory = mongoose.model("Inventory", inventorySchema);

export const validateInventory = (data) => {
  const schema = Joi.object({
    branch: Joi.string().required(),
    itemName: Joi.string().required(),
    quantity: Joi.number().min(0).required(),
    unit: Joi.string().required(),
    threshold: Joi.number().min(0),
  });
  return schema.validate(data);
};
