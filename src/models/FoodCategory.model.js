import mongoose from "mongoose";
import Joi from "joi";
import { generateCategoryId, getNextCounter } from "../utils/idGenerator.js";

const foodCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      maxlength: [100, "Category name cannot exceed 100 characters"],
    },
    categoryId: {
      type: String,
      unique: true,
      trim: true,
      // Will be auto-generated in pre-save middleware
    },
    description: {
      type: String,
      default: "",
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    type: {
      type: String,
      enum: {
        values: ["veg", "non-veg", "both"],
        message: "Type must be veg, non-veg, or both",
      },
      default: "both",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch is required"],
    },
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: [true, "Hotel is required"],
    },
    image: {
      type: String,
      default: null,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    // Menu timing
    availableTimings: {
      breakfast: { type: Boolean, default: true },
      lunch: { type: Boolean, default: true },
      dinner: { type: Boolean, default: true },
      snacks: { type: Boolean, default: true },
    },
    // SEO and additional info
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-generate categoryId before saving
foodCategorySchema.pre("save", async function (next) {
  if (!this.categoryId && this.isNew) {
    try {
      const year = new Date().getFullYear();
      const prefix = `CAT-${year}`;
      const counter = await getNextCounter(
        this.constructor,
        "categoryId",
        prefix
      );
      this.categoryId = generateCategoryId(counter);
    } catch (error) {
      return next(error);
    }
  }

  // Auto-generate slug from name if not provided
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Ensure slug uniqueness
    const existingCategory = await this.constructor.findOne({
      slug: this.slug,
      _id: { $ne: this._id },
    });
    if (existingCategory) {
      this.slug = `${this.slug}-${Date.now()}`;
    }
  }

  next();
});

// Indexes
foodCategorySchema.index({ branch: 1 });
foodCategorySchema.index({ hotel: 1 });
foodCategorySchema.index({ isActive: 1 });
foodCategorySchema.index({ displayOrder: 1 });
foodCategorySchema.index({ slug: 1 });

// Virtual for item count
foodCategorySchema.virtual("itemCount", {
  ref: "FoodItem",
  localField: "_id",
  foreignField: "category",
  count: true,
});

export const FoodCategory = mongoose.model("FoodCategory", foodCategorySchema);

// Enhanced validation schemas
export const foodCategoryValidationSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
      "string.empty": "Category name is required",
      "string.min": "Category name must be at least 2 characters long",
      "string.max": "Category name cannot exceed 100 characters",
    }),
    description: Joi.string().max(500).allow("").optional(),
    type: Joi.string().valid("veg", "non-veg", "both").default("both"),
    isActive: Joi.boolean().default(true),
    displayOrder: Joi.number().integer().min(0).default(0),
    branch: Joi.string().required().messages({
      "string.empty": "Branch is required",
    }),
    hotel: Joi.string().required().messages({
      "string.empty": "Hotel is required",
    }),
    image: Joi.string().uri().optional().allow(null, ""),
    tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
    availableTimings: Joi.object({
      breakfast: Joi.boolean().default(true),
      lunch: Joi.boolean().default(true),
      dinner: Joi.boolean().default(true),
      snacks: Joi.boolean().default(true),
    }).optional(),
    slug: Joi.string().lowercase().trim().optional(),
  }),

  update: Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    description: Joi.string().max(500).allow("").optional(),
    type: Joi.string().valid("veg", "non-veg", "both").optional(),
    isActive: Joi.boolean().optional(),
    displayOrder: Joi.number().integer().min(0).optional(),
    image: Joi.string().uri().optional().allow(null, ""),
    tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
    availableTimings: Joi.object({
      breakfast: Joi.boolean(),
      lunch: Joi.boolean(),
      dinner: Joi.boolean(),
      snacks: Joi.boolean(),
    }).optional(),
    slug: Joi.string().lowercase().trim().optional(),
  }),
};

// Legacy validation function for backward compatibility
export const validateFoodCategory = (data) => {
  return foodCategoryValidationSchemas.create.validate(data);
};
