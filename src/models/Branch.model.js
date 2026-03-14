import mongoose from "mongoose";
import { generateBranchId, getNextCounter } from "../utils/idGenerator.js";

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Branch name is required"],
      trim: true,
      maxlength: [100, "Branch name cannot exceed 100 characters"],
    },
    branchId: {
      type: String,
      unique: true,
      trim: true,
      // Will be auto-generated in pre-save middleware
    },
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: [true, "Hotel reference is required"],
    },
    location: {
      address: {
        type: String,
        required: [true, "Address is required"],
        trim: true,
      },
      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
      },
      state: {
        type: String,
        required: [true, "State is required"],
        trim: true,
      },
      country: {
        type: String,
        required: [true, "Country is required"],
        trim: true,
        default: "India",
      },
      pincode: {
        type: String,
        required: [true, "Pincode is required"],
        trim: true,
      },
      coordinates: {
        latitude: {
          type: Number,
          min: [-90, "Latitude must be between -90 and 90"],
          max: [90, "Latitude must be between -90 and 90"],
        },
        longitude: {
          type: Number,
          min: [-180, "Longitude must be between -180 and 180"],
          max: [180, "Longitude must be between -180 and 180"],
        },
      },
    },
    contactInfo: {
      phone: {
        type: String,
        required: [true, "Phone number is required"],
        trim: true,
      },
      email: {
        type: String,
        required: [true, "Email is required"],
        trim: true,
        lowercase: true,
      },
    },
    operatingHours: {
      openTime: {
        type: String,
        required: [true, "Opening time is required"],
      },
      closeTime: {
        type: String,
        required: [true, "Closing time is required"],
      },
      isOpen24Hours: {
        type: Boolean,
        default: false,
      },
    },
    capacity: {
      totalTables: {
        type: Number,
        min: [1, "Total tables must be at least 1"],
        required: [true, "Total tables is required"],
      },
      maxOccupancy: {
        type: Number,
        min: [1, "Max occupancy must be at least 1"],
        required: [true, "Max occupancy is required"],
      },
    },
    amenities: [
      {
        type: String,
        trim: true,
      },
    ],
    images: [
      {
        url: { type: String, required: true },
        alt: { type: String, default: "" },
      },
    ],
    status: {
      type: String,
      enum: {
        values: ["active", "inactive", "maintenance"],
        message: "Status must be either active, inactive, or maintenance",
      },
      default: "active",
    },
    rating: {
      average: {
        type: Number,
        min: [0, "Rating cannot be negative"],
        max: [5, "Rating cannot exceed 5"],
        default: 0,
      },
      totalReviews: {
        type: Number,
        min: [0, "Total reviews cannot be negative"],
        default: 0,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Created by admin is required"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field to populate hotel information
branchSchema.virtual("hotelInfo", {
  ref: "Hotel",
  localField: "hotel",
  foreignField: "_id",
  justOne: true,
});

// Pre-save middleware to auto-generate branchId
branchSchema.pre("save", async function (next) {
  if (!this.branchId && this.isNew) {
    try {
      // Need to populate hotel to get hotelId
      await this.populate("hotel", "hotelId");

      if (!this.hotel || !this.hotel.hotelId) {
        return next(
          new Error("Hotel information is required to generate branch ID")
        );
      }

      const hotelId = this.hotel.hotelId;
      const counter = await getNextCounter(
        this.constructor,
        "branchId",
        "BRN-"
      );
      this.branchId = generateBranchId(hotelId, counter);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Index for better performance
// Note: branchId already has unique index from field definition
branchSchema.index({ hotel: 1 });
branchSchema.index({ "location.city": 1 });
branchSchema.index({ "location.state": 1 });
branchSchema.index({ "location.pincode": 1 });
branchSchema.index({ status: 1 });
branchSchema.index({ "rating.average": -1 });
branchSchema.index({ "location.coordinates": "2dsphere" }); // For geospatial queries
branchSchema.index({ createdBy: 1 }); // Index for admin-specific queries

export const Branch = mongoose.model("Branch", branchSchema);

// Validators extracted to src/validators/branch.validators.js
export { validateBranch, validateUpdateBranch, validateBranchLocationSearch } from "../validators/branch.validators.js";
