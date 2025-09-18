import mongoose from "mongoose";
import Joi from "joi";

const tableSchema = new mongoose.Schema(
  {
    tableNumber: { type: Number, required: true },
    uniqueId: { type: String, unique: true, required: true },
    isBooked: { type: Boolean, default: false },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
  },
  { timestamps: true }
);

export const Table = mongoose.model("Table", tableSchema);

export const validateTable = (data) => {
  const schema = Joi.object({
    tableNumber: Joi.number().required(),
    branch: Joi.string().required(),
  });
  return schema.validate(data);
};
