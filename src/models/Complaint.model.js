import mongoose from "mongoose";
import Joi from "joi";

const complaintSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved"],
      default: "open",
    },
  },
  { timestamps: true }
);

export const Complaint = mongoose.model("Complaint", complaintSchema);

export const validateComplaint = (data) => {
  const schema = Joi.object({
    user: Joi.string().required(),
    branch: Joi.string().required(),
    message: Joi.string().min(5).required(),
  });
  return schema.validate(data);
};
