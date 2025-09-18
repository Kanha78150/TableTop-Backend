import mongoose from "mongoose";
import Joi from "joi";

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    table: { type: mongoose.Schema.Types.ObjectId, ref: "Table" },
    bookingTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ["booked", "cancelled", "completed"],
      default: "booked",
    },
  },
  { timestamps: true }
);

export const Booking = mongoose.model("Booking", bookingSchema);

export const validateBooking = (data) => {
  const schema = Joi.object({
    user: Joi.string().required(),
    branch: Joi.string().required(),
    table: Joi.string().required(),
    bookingTime: Joi.date().greater("now").required(),
  });
  return schema.validate(data);
};
