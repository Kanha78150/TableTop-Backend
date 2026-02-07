import mongoose from "mongoose";
import Joi from "joi";
import { generateHotelId, getNextCounter } from "../utils/idGenerator.js";

const hotelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Hotel name is required"],
      trim: true,
      maxlength: [100, "Hotel name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Hotel description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    hotelId: {
      type: String,
      unique: true,
      trim: true,
      // Will be auto-generated in pre-save middleware
    },
    mainLocation: {
      address: {
        type: String,
        required: [true, "Main address is required"],
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
      website: {
        type: String,
        trim: true,
      },
    },
    images: [
      {
        url: { type: String, required: true },
        alt: { type: String, default: "" },
      },
    ],
    amenities: [
      {
        type: String,
        trim: true,
      },
    ],
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
    status: {
      type: String,
      enum: {
        values: ["active", "inactive", "maintenance"],
        message: "Status must be either active, inactive, or maintenance",
      },
      default: "active",
    },
    establishedYear: {
      type: Number,
      min: [1800, "Established year seems too old"],
      max: [
        new Date().getFullYear(),
        "Established year cannot be in the future",
      ],
    },
    starRating: {
      type: Number,
      min: [1, "Star rating must be at least 1"],
      max: [5, "Star rating cannot exceed 5"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Created by admin is required"],
    },

    // Commission configuration for multi-provider payment system
    // Completely separate from subscription - per-hotel commission rates
    commissionConfig: {
      type: {
        type: String,
        enum: ["percentage", "fixed", "none"],
        default: "none", // No commission by default (must be explicitly set)
      },
      rate: {
        type: Number,
        default: 0,
        min: 0,
        max: 1, // For percentage (0-100% represented as 0-1)
      },
      fixedAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      status: {
        type: String,
        enum: ["active", "suspended", "waived"],
        default: "active",
      },
      notes: {
        type: String,
        maxlength: [500, "Notes cannot exceed 500 characters"],
      },
      setBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin", // SuperAdmin who set this rate
      },
      lastModified: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field to get all branches of this hotel
hotelSchema.virtual("branches", {
  ref: "Branch",
  localField: "_id",
  foreignField: "hotel",
});

// Virtual field to get payment configuration
hotelSchema.virtual("paymentConfig", {
  ref: "PaymentConfig",
  localField: "_id",
  foreignField: "hotel",
  justOne: true,
});

// Pre-save middleware to auto-generate hotelId
hotelSchema.pre("save", async function (next) {
  if (!this.hotelId && this.isNew) {
    try {
      const year = new Date().getFullYear();
      const prefix = `HTL-${year}`;
      const counter = await getNextCounter(this.constructor, "hotelId", prefix);
      this.hotelId = generateHotelId(counter);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Index for better performance
// Note: hotelId already has unique index from field definition
hotelSchema.index({ "mainLocation.city": 1 });
hotelSchema.index({ "mainLocation.state": 1 });
hotelSchema.index({ status: 1 });
hotelSchema.index({ "rating.average": -1 });
hotelSchema.index({ createdBy: 1 }); // Index for admin-specific queries

export const Hotel = mongoose.model("Hotel", hotelSchema);

export const validateHotel = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().min(1).max(500).required(),
    // hotelId will be auto-generated, so not required in validation
    mainLocation: Joi.object({
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
      website: Joi.string().uri().optional(),
    }).required(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          alt: Joi.string().allow(""),
        })
      )
      .optional(),
    amenities: Joi.array().items(Joi.string()).optional(),
    establishedYear: Joi.number()
      .integer()
      .min(1800)
      .max(new Date().getFullYear())
      .optional(),
    starRating: Joi.number().min(1).max(5).optional(),
  });
  return schema.validate(data);
};

export const validateUpdateHotel = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    description: Joi.string().min(1).max(500).optional(),
    mainLocation: Joi.object({
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
      website: Joi.string().uri().optional(),
    }).optional(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          alt: Joi.string().allow(""),
        })
      )
      .optional(),
    amenities: Joi.array().items(Joi.string()).optional(),
    status: Joi.string().valid("active", "inactive", "maintenance").optional(),
    establishedYear: Joi.number()
      .integer()
      .min(1800)
      .max(new Date().getFullYear())
      .optional(),
    starRating: Joi.number().min(1).max(5).optional(),
  });
  return schema.validate(data);
};
