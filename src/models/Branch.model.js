import mongoose from "mongoose";
import Joi from "joi";
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

export const validateBranch = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    // branchId will be auto-generated, so not required in validation
    hotel: Joi.string().required(), // ObjectId as string
    location: Joi.object({
      address: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      country: Joi.string().default("India"),
      pincode: Joi.string()
        .pattern(/^[0-9]{6}$/)
        .required()
        .messages({
          "string.pattern.base": "Pincode must be 6 digits",
        }),
      coordinates: Joi.object({
        latitude: Joi.number().min(-90).max(90),
        longitude: Joi.number().min(-180).max(180),
      }).optional(),
    }).required(),
    contactInfo: Joi.object({
      phone: Joi.string()
        .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
        .required()
        .messages({
          "string.pattern.base":
            "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
        }),
      email: Joi.string().email().required(),
    }).required(),
    operatingHours: Joi.object({
      openTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .required()
        .messages({
          "string.pattern.base": "Open time must be in HH:MM format",
        }),
      closeTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .required()
        .messages({
          "string.pattern.base": "Close time must be in HH:MM format",
        }),
      isOpen24Hours: Joi.boolean().optional(),
    }).required(),
    capacity: Joi.object({
      totalTables: Joi.number().integer().min(1).required(),
      maxOccupancy: Joi.number().integer().min(1).required(),
    }).required(),
    amenities: Joi.array().items(Joi.string()).optional(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          alt: Joi.string().allow(""),
        })
      )
      .optional(),
  });
  return schema.validate(data);
};

export const validateUpdateBranch = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    location: Joi.object({
      address: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      pincode: Joi.string()
        .pattern(/^[0-9]{6}$/)
        .optional()
        .messages({
          "string.pattern.base": "Pincode must be 6 digits",
        }),
      coordinates: Joi.object({
        latitude: Joi.number().min(-90).max(90),
        longitude: Joi.number().min(-180).max(180),
      }).optional(),
    }).optional(),
    contactInfo: Joi.object({
      phone: Joi.string()
        .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
        .optional()
        .messages({
          "string.pattern.base":
            "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
        }),
      email: Joi.string().email().optional(),
    }).optional(),
    operatingHours: Joi.object({
      openTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .optional()
        .messages({
          "string.pattern.base": "Open time must be in HH:MM format",
        }),
      closeTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .optional()
        .messages({
          "string.pattern.base": "Close time must be in HH:MM format",
        }),
      isOpen24Hours: Joi.boolean().optional(),
    }).optional(),
    capacity: Joi.object({
      totalTables: Joi.number().integer().min(1).optional(),
      maxOccupancy: Joi.number().integer().min(1).optional(),
    }).optional(),
    amenities: Joi.array().items(Joi.string()).optional(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          alt: Joi.string().allow(""),
        })
      )
      .optional(),
    status: Joi.string().valid("active", "inactive", "maintenance").optional(),
  });
  return schema.validate(data);
};

// Validation for location-based branch search
export const validateBranchLocationSearch = (data) => {
  const schema = Joi.object({
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    pincode: Joi.string()
      .pattern(/^[0-9]{6}$/)
      .optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    radius: Joi.number().min(0.1).max(100).optional(), // radius in km
    hotelId: Joi.string().optional(), // to filter branches by specific hotel
  });
  return schema.validate(data);
};
