import mongoose from "mongoose";
import Joi from "joi";
import { generateCategoryId, getNextCounter } from "../utils/idGenerator.js";
import { resolveHotelId, resolveBranchId } from "../utils/idResolver.js";

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
      type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
      ref: "Branch",
      required: [true, "Branch is required"],
    },
    hotel: {
      type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
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
    availableTimings: {
      breakfast: { type: Boolean, default: true },
      lunch: { type: Boolean, default: true },
      dinner: { type: Boolean, default: true },
      snacks: { type: Boolean, default: true },
    },
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

// Auto-generate categoryId and resolve IDs before validation
foodCategorySchema.pre("validate", async function (next) {
  // Auto-generate categoryId if needed
  if (!this.categoryId && this.isNew) {
    try {
      const year = new Date().getFullYear();
      const prefix = `CAT-${year}`;

      // Retry logic for duplicate IDs
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const counter = await getNextCounter(
          this.constructor,
          "categoryId",
          prefix
        );
        const potentialId = generateCategoryId(counter + attempts);

        // Check if this ID already exists
        const existingCategory = await this.constructor.findOne({
          categoryId: potentialId,
        });

        if (!existingCategory) {
          this.categoryId = potentialId;
          break;
        }

        attempts++;
      }

      if (!this.categoryId) {
        return next(
          new Error(
            "Unable to generate unique category ID after multiple attempts"
          )
        );
      }
    } catch (error) {
      return next(error);
    }
  }

  // Resolve hotel ID if it's a string (auto-generated ID)
  if (this.hotel && typeof this.hotel === "string") {
    try {
      const resolvedHotelId = await resolveHotelId(this.hotel);

      if (!resolvedHotelId) {
        return next(
          new Error(`Hotel not found with identifier: ${this.hotel}`)
        );
      }
      this.hotel = new mongoose.Types.ObjectId(resolvedHotelId);
    } catch (error) {
      return next(error);
    }
  } else if (!this.hotel) {
    return next(new Error("Hotel field is required"));
  }

  // Resolve branch ID if it's a string (auto-generated ID)
  if (this.branch && typeof this.branch === "string") {
    try {
      // Pass the resolved hotel ID (ObjectId) or original hotel value
      const hotelForBranch =
        this.hotel instanceof mongoose.Types.ObjectId
          ? this.hotel.toString()
          : this.hotel;
      const resolvedBranchId = await resolveBranchId(
        this.branch,
        hotelForBranch
      );

      if (!resolvedBranchId) {
        return next(
          new Error(`Branch not found with identifier: ${this.branch}`)
        );
      }
      this.branch = new mongoose.Types.ObjectId(resolvedBranchId);
    } catch (error) {
      return next(error);
    }
  } else if (!this.branch) {
    return next(new Error("Branch field is required"));
  }

  next();
});

// Auto-generate slug before saving
foodCategorySchema.pre("save", async function (next) {
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

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
    branch: Joi.alternatives()
      .try(
        Joi.string().length(24).hex().messages({
          "string.length": "Branch MongoDB ID must be 24 characters",
          "string.hex": "Branch MongoDB ID must be hexadecimal",
        }),
        Joi.string()
          .pattern(/^BRN-[A-Z0-9]+-\d{5}$/)
          .messages({
            "string.pattern.base": "Branch ID must be in format BRN-XXX-00000",
          })
      )
      .required()
      .messages({
        "any.required": "Branch is required",
      }),
    hotel: Joi.alternatives()
      .try(
        Joi.string().length(24).hex().messages({
          "string.length": "Hotel MongoDB ID must be 24 characters",
          "string.hex": "Hotel MongoDB ID must be hexadecimal",
        }),
        Joi.string()
          .pattern(/^HTL-\d{4}-\d{5}$/)
          .messages({
            "string.pattern.base": "Hotel ID must be in format HTL-YYYY-00000",
          })
      )
      .required()
      .messages({
        "any.required": "Hotel is required",
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
