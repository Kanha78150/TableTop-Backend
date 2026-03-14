import mongoose from "mongoose";

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

// Validators extracted to src/validators/booking.validators.js
export { validateBooking } from "../validators/booking.validators.js";
