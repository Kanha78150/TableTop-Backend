import mongoose from "mongoose";
import Joi from "joi";
import { generateFoodItemId, getNextCounter } from "../utils/idGenerator.js";
import {
  resolveHotelId,
  resolveBranchId,
  resolveCategoryId,
} from "../utils/idResolver.js";

const foodItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Food item name is required"],
      trim: true,
      maxlength: [150, "Food item name cannot exceed 150 characters"],
    },
    itemId: {
      type: String,
      unique: true,
      trim: true,
      // Will be auto-generated in pre-save middleware
    },
    description: {
      type: String,
      default: "",
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    shortDescription: {
      type: String,
      maxlength: [200, "Short description cannot exceed 200 characters"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    discountPrice: {
      type: Number,
      min: [0, "Discount price cannot be negative"],
      validate: {
        validator: function (value) {
          if (!value) return true;
          if (this.price === undefined || this.price === null) {
            return true; // Let controller handle validation
          }

          return value < this.price;
        },
        message: "Discount price must be less than regular price",
      },
    },
    // Veg/Non-veg classification
    foodType: {
      type: String,
      enum: {
        values: ["veg", "non-veg", "vegan", "jain"],
        message: "Food type must be veg, non-veg, vegan, or jain",
      },
      required: [true, "Food type is required"],
    },
    // Spice level
    spiceLevel: {
      type: String,
      enum: {
        values: ["mild", "medium", "hot", "extra-hot", "none"],
        message: "Spice level must be mild, medium, hot, extra-hot, or none",
      },
    },
    // Dietary information
    dietaryInfo: {
      glutenFree: { type: Boolean, default: false },
      dairyFree: { type: Boolean, default: false },
      nutFree: { type: Boolean, default: false },
      sugarFree: { type: Boolean, default: false },
      organic: { type: Boolean, default: false },
    },
    // Availability
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isRecommended: {
      type: Boolean,
    },
    isBestSeller: {
      type: Boolean,
      default: false,
    },
    // Removed isNew field to avoid Mongoose reserved key warning
    // Menu timing availability
    availableTimings: {
      breakfast: { type: Boolean, default: false },
      lunch: { type: Boolean, default: true },
      dinner: { type: Boolean, default: true },
      snacks: { type: Boolean, default: false },
    },
    // Relationships
    category: {
      type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
      ref: "FoodCategory",
      required: [true, "Category is required"],
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
    // Media
    image: {
      type: String,
      default: null,
    },
    images: [
      {
        type: String,
      },
    ],
    // Nutritional information
    nutritionalInfo: {
      calories: { type: Number, min: 0 },
      protein: { type: Number, min: 0 }, // in grams
      carbs: { type: Number, min: 0 }, // in grams
      fat: { type: Number, min: 0 }, // in grams
      fiber: { type: Number, min: 0 }, // in grams
      sodium: { type: Number, min: 0 }, // in mg
      sugar: { type: Number, min: 0 }, // in grams
    },
    // Additional details
    preparationTime: {
      type: Number, // in minutes
      min: [1, "Preparation time must be at least 1 minute"],
      max: [180, "Preparation time cannot exceed 180 minutes"],
    },
    servingSize: {
      type: String,
    },
    ingredients: [
      {
        type: String,
        trim: true,
      },
    ],
    allergens: [
      {
        type: String,
        enum: [
          "nuts",
          "dairy",
          "gluten",
          "soy",
          "eggs",
          "shellfish",
          "fish",
          "sesame",
        ],
        message: "Invalid allergen type",
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, "Tag cannot exceed 50 characters"],
      },
    ],
    // SEO and ordering
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    // Ratings and reviews
    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Inventory tracking
    isLimitedQuantity: {
      type: Boolean,
      default: false,
    },
    quantityAvailable: {
      type: Number,
      min: 0,
      default: null,
    },
    // GST Configuration
    gstRate: {
      type: Number,
      required: [true, "GST rate is required"],
      enum: {
        values: [0, 5, 12, 18, 28],
        message: "GST rate must be one of: 0%, 5%, 12%, 18%, or 28%",
      },
    },
    // Audit
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    lastModifiedBy: {
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

// Auto-generate itemId and resolve IDs before validation
foodItemSchema.pre("validate", async function (next) {
  if (!this.itemId && this.isNew) {
    try {
      const year = new Date().getFullYear();
      const prefix = `ITEM-${year}`;

      // Retry logic for duplicate IDs
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const counter = await getNextCounter(
          this.constructor,
          "itemId",
          prefix
        );
        const potentialId = generateFoodItemId(counter + attempts);

        // Check if this ID already exists
        const existingItem = await this.constructor.findOne({
          itemId: potentialId,
        });

        if (!existingItem) {
          this.itemId = potentialId;
          break;
        }

        attempts++;
      }

      if (!this.itemId) {
        return next(
          new Error("Unable to generate unique item ID after multiple attempts")
        );
      }
    } catch (error) {
      return next(error);
    }
  }

  // Resolve hotel, branch, and category IDs if they are auto-generated IDs
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
  }

  if (this.branch && typeof this.branch === "string") {
    try {
      const resolvedBranchId = await resolveBranchId(this.branch, this.hotel);
      if (!resolvedBranchId) {
        return next(
          new Error(`Branch not found with identifier: ${this.branch}`)
        );
      }
      this.branch = new mongoose.Types.ObjectId(resolvedBranchId);
    } catch (error) {
      return next(error);
    }
  }

  if (this.category && typeof this.category === "string") {
    try {
      const resolvedCategoryId = await resolveCategoryId(this.category);
      if (!resolvedCategoryId) {
        return next(
          new Error(`Category not found with identifier: ${this.category}`)
        );
      }
      this.category = new mongoose.Types.ObjectId(resolvedCategoryId);
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
    const existingItem = await this.constructor.findOne({
      slug: this.slug,
      _id: { $ne: this._id },
    });
    if (existingItem) {
      this.slug = `${this.slug}-${Date.now()}`;
    }
  }

  // Set lastModifiedBy on update
  if (this.isModified() && !this.isNew) {
    this.lastModifiedBy = this.createdBy; // You can set this from the request context
  }

  next();
});

// Indexes for better performance
foodItemSchema.index({ category: 1 });
foodItemSchema.index({ branch: 1 });
foodItemSchema.index({ hotel: 1 });
foodItemSchema.index({ isAvailable: 1 });
foodItemSchema.index({ foodType: 1 });
foodItemSchema.index({ price: 1 });
foodItemSchema.index({ isRecommended: 1 });
foodItemSchema.index({ isBestSeller: 1 });
// Removed duplicate slug index to avoid Mongoose warning
foodItemSchema.index({ displayOrder: 1 });
foodItemSchema.index({ averageRating: -1 });

// Virtual for effective price (with discount)
foodItemSchema.virtual("effectivePrice").get(function () {
  return this.discountPrice || this.price;
});

// Virtual for discount percentage
foodItemSchema.virtual("discountPercentage").get(function () {
  if (this.discountPrice && this.discountPrice < this.price) {
    return Math.round(((this.price - this.discountPrice) / this.price) * 100);
  }
  return 0;
});

export const FoodItem = mongoose.model("FoodItem", foodItemSchema);

// Enhanced validation schemas
export const foodItemValidationSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(2).max(150).required().messages({
      "string.empty": "Food item name is required",
      "string.min": "Food item name must be at least 2 characters long",
      "string.max": "Food item name cannot exceed 150 characters",
    }),
    description: Joi.string().max(1000).allow("").optional(),
    shortDescription: Joi.string().max(200).allow("").optional(),
    price: Joi.number().positive().required().messages({
      "number.positive": "Price must be a positive number",
      "any.required": "Price is required",
    }),
    discountPrice: Joi.number().positive().optional(),
    foodType: Joi.string()
      .valid("veg", "non-veg", "vegan", "jain")
      .required()
      .messages({
        "any.only": "Food type must be veg, non-veg, vegan, or jain",
        "any.required": "Food type is required",
      }),
    spiceLevel: Joi.string()
      .valid("mild", "medium", "hot", "extra-hot", "none")
      .default("medium"),
    dietaryInfo: Joi.object({
      glutenFree: Joi.boolean().default(false),
      dairyFree: Joi.boolean().default(false),
      nutFree: Joi.boolean().default(false),
      sugarFree: Joi.boolean().default(false),
      organic: Joi.boolean().default(false),
    }).optional(),
    isAvailable: Joi.boolean().default(true),
    isRecommended: Joi.boolean().optional(),
    isBestSeller: Joi.boolean().default(false),
    isNew: Joi.boolean().default(false),
    availableTimings: Joi.object({
      breakfast: Joi.boolean().default(false),
      lunch: Joi.boolean().default(true),
      dinner: Joi.boolean().default(true),
      snacks: Joi.boolean().default(false),
    }).optional(),
    category: Joi.alternatives()
      .try(
        Joi.string().length(24).hex().messages({
          "string.length": "Category MongoDB ID must be 24 characters",
          "string.hex": "Category MongoDB ID must be hexadecimal",
        }),
        Joi.string()
          .pattern(/^CAT-\d{4}-\d{5}$/)
          .messages({
            "string.pattern.base":
              "Category ID must be in format CAT-YYYY-00000",
          })
      )
      .required()
      .messages({
        "any.required": "Category is required",
      }),
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
    images: Joi.array().items(Joi.string().uri()).optional(),
    nutritionalInfo: Joi.object({
      calories: Joi.number().min(0).optional(),
      protein: Joi.number().min(0).optional(),
      carbs: Joi.number().min(0).optional(),
      fat: Joi.number().min(0).optional(),
      fiber: Joi.number().min(0).optional(),
      sodium: Joi.number().min(0).optional(),
    }).optional(),
    preparationTime: Joi.number().min(1).max(180).optional(),
    servingSize: Joi.string().max(50).optional(),
    ingredients: Joi.array().items(Joi.string().trim().max(100)).optional(),
    allergens: Joi.array()
      .items(
        Joi.string().valid(
          "nuts",
          "dairy",
          "gluten",
          "soy",
          "eggs",
          "shellfish",
          "fish",
          "sesame"
        )
      )
      .optional(),
    tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
    displayOrder: Joi.number().integer().min(0).default(0),
    isLimitedQuantity: Joi.boolean().default(false),
    quantityAvailable: Joi.number().min(0).optional().allow(null),
    slug: Joi.string().lowercase().trim().optional(),
  }),

  update: Joi.object({
    name: Joi.string().trim().min(2).max(150).optional(),
    description: Joi.string().max(1000).allow("").optional(),
    shortDescription: Joi.string().max(200).allow("").optional(),
    price: Joi.number().positive().optional(),
    discountPrice: Joi.number().positive().optional().allow(null),
    foodType: Joi.string().valid("veg", "non-veg", "vegan", "jain").optional(),
    spiceLevel: Joi.string()
      .valid("mild", "medium", "hot", "extra-hot", "none")
      .optional(),
    dietaryInfo: Joi.object({
      glutenFree: Joi.boolean(),
      dairyFree: Joi.boolean(),
      nutFree: Joi.boolean(),
      sugarFree: Joi.boolean(),
      organic: Joi.boolean(),
    }).optional(),
    isAvailable: Joi.boolean().optional(),
    isRecommended: Joi.boolean().optional(),
    isBestSeller: Joi.boolean().optional(),
    isNew: Joi.boolean().optional(),
    availableTimings: Joi.object({
      breakfast: Joi.boolean(),
      lunch: Joi.boolean(),
      dinner: Joi.boolean(),
      snacks: Joi.boolean(),
    }).optional(),
    category: Joi.alternatives()
      .try(
        Joi.string().length(24).hex().messages({
          "string.length": "Category MongoDB ID must be 24 characters",
          "string.hex": "Category MongoDB ID must be hexadecimal",
        }),
        Joi.string()
          .pattern(/^CAT-\d{4}-\d{5}$/)
          .messages({
            "string.pattern.base":
              "Category ID must be in format CAT-YYYY-00000",
          })
      )
      .optional(),
    image: Joi.string().uri().optional().allow(null, ""),
    images: Joi.array().items(Joi.string().uri()).optional(),
    nutritionalInfo: Joi.object({
      calories: Joi.number().min(0),
      protein: Joi.number().min(0),
      carbs: Joi.number().min(0),
      fat: Joi.number().min(0),
      fiber: Joi.number().min(0),
      sodium: Joi.number().min(0),
    }).optional(),
    preparationTime: Joi.number().min(1).max(180).optional(),
    servingSize: Joi.string().max(50).optional(),
    ingredients: Joi.array().items(Joi.string().trim().max(100)).optional(),
    allergens: Joi.array()
      .items(
        Joi.string().valid(
          "nuts",
          "dairy",
          "gluten",
          "soy",
          "eggs",
          "shellfish",
          "fish",
          "sesame"
        )
      )
      .optional(),
    tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
    displayOrder: Joi.number().integer().min(0).optional(),
    isLimitedQuantity: Joi.boolean().optional(),
    quantityAvailable: Joi.number().min(0).optional().allow(null),
    slug: Joi.string().lowercase().trim().optional(),
  }),

  updateAvailability: Joi.object({
    isAvailable: Joi.boolean().required(),
    quantityAvailable: Joi.number().min(0).optional().allow(null),
  }),
};

// Legacy validation function for backward compatibility
export const validateFoodItem = (data) => {
  return foodItemValidationSchemas.create.validate(data);
};
