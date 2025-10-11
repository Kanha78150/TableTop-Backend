import mongoose from "mongoose";
import Joi from "joi";

const cartItemSchema = new mongoose.Schema({
  foodItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FoodItem",
    required: [true, "Food item is required"],
  },
  quantity: {
    type: Number,
    required: [true, "Quantity is required"],
    min: [1, "Quantity must be at least 1"],
    max: [20, "Maximum 20 items allowed per food item"],
  },
  price: {
    type: Number,
    required: [true, "Price is required"],
    min: [0, "Price cannot be negative"],
  },
  totalPrice: {
    type: Number,
    required: [true, "Total price is required"],
    min: [0, "Total price cannot be negative"],
  },
  customizations: {
    spiceLevel: {
      type: String,
      enum: ["mild", "medium", "hot", "extra-hot"],
    },
    size: {
      type: String,
      enum: ["small", "medium", "large", "extra-large"],
    },
    addOns: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
      },
    ],
    removedIngredients: [
      {
        type: String,
        trim: true,
      },
    ],
    specialInstructions: {
      type: String,
      maxlength: [200, "Special instructions cannot exceed 200 characters"],
      trim: true,
    },
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    items: [cartItemSchema],
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: [true, "Hotel is required"],
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: false, // Branch is optional for hotels without branches
      default: null,
    },
    subtotal: {
      type: Number,
      default: 0,
      min: [0, "Subtotal cannot be negative"],
    },
    totalItems: {
      type: Number,
      default: 0,
      min: [0, "Total items cannot be negative"],
    },
    // Session information for guest users (future enhancement)
    sessionId: {
      type: String,
      // Removed sparse: true to avoid duplicate index - will be created explicitly below
    },
    // Cart expiry (auto-cleanup after 24 hours of inactivity)
    expiresAt: {
      type: Date,
      default: Date.now,
      // Removed expires option to avoid duplicate index - will be created explicitly below
    },
    // Status for checkout process
    status: {
      type: String,
      enum: ["active", "checkout", "abandoned", "converted", "completed"],
      default: "active",
    },
    // Link to order created during checkout
    checkoutOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    // Completion timestamp
    completedAt: {
      type: Date,
      default: null,
    },
    // Validation flags
    isValidated: {
      type: Boolean,
      default: false,
    },
    validationErrors: [
      {
        itemId: mongoose.Schema.Types.ObjectId,
        error: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
cartSchema.index({ user: 1 });
cartSchema.index({ hotel: 1, branch: 1 });
cartSchema.index({ status: 1 });
// TTL index for auto-cleanup after 24 hours (86400 seconds)
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
// Sparse index for sessionId (allows null values)
cartSchema.index({ sessionId: 1 }, { sparse: true });

// Ensure user can only have one active cart per hotel-branch combination
cartSchema.index(
  { user: 1, hotel: 1, branch: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  }
);

// Virtual for total discount
cartSchema.virtual("totalDiscount").get(function () {
  return this.items.reduce((total, item) => {
    const itemDiscount =
      item.customizations?.addOns?.reduce(
        (addOnTotal, addOn) => addOnTotal + addOn.price,
        0
      ) || 0;
    return total + itemDiscount;
  }, 0);
});

// Pre-save middleware to calculate totals
cartSchema.pre("save", function (next) {
  // Calculate subtotal and total items
  this.subtotal = this.items.reduce(
    (total, item) => total + item.totalPrice,
    0
  );
  this.totalItems = this.items.reduce(
    (total, item) => total + item.quantity,
    0
  );

  // Update expiry time on any change
  this.expiresAt = new Date(Date.now() + 86400 * 1000); // 24 hours from now

  next();
});

// Static method to find or create cart for user
cartSchema.statics.findOrCreateCart = async function (
  userId,
  hotelId,
  branchId
) {
  // Normalize branchId - convert empty string or null to null
  const normalizedBranchId = branchId && branchId !== "" ? branchId : null;

  let cart = await this.findOne({
    user: userId,
    hotel: hotelId,
    branch: normalizedBranchId,
    status: "active",
  }).populate({
    path: "items.foodItem",
    select:
      "name price discountPrice image isAvailable quantityAvailable foodType spiceLevel",
  });

  if (!cart) {
    cart = new this({
      user: userId,
      hotel: hotelId,
      branch: normalizedBranchId,
      items: [],
    });
    await cart.save();
  }

  return cart;
};

// Instance method to add item to cart
cartSchema.methods.addItem = function (
  foodItemId,
  quantity,
  price,
  customizations = {}
) {
  const existingItemIndex = this.items.findIndex(
    (item) =>
      item.foodItem.toString() === foodItemId.toString() &&
      JSON.stringify(item.customizations) === JSON.stringify(customizations)
  );

  if (existingItemIndex > -1) {
    // Update existing item quantity
    this.items[existingItemIndex].quantity += quantity;
    this.items[existingItemIndex].totalPrice =
      this.items[existingItemIndex].quantity * price;

    // Add add-on prices
    if (customizations.addOns?.length) {
      const addOnPrice = customizations.addOns.reduce(
        (total, addOn) => total + addOn.price,
        0
      );
      this.items[existingItemIndex].totalPrice +=
        addOnPrice * this.items[existingItemIndex].quantity;
    }
  } else {
    // Add new item
    let totalPrice = quantity * price;

    // Add add-on prices
    if (customizations.addOns?.length) {
      const addOnPrice = customizations.addOns.reduce(
        (total, addOn) => total + addOn.price,
        0
      );
      totalPrice += addOnPrice * quantity;
    }

    this.items.push({
      foodItem: foodItemId,
      quantity,
      price,
      totalPrice,
      customizations,
    });
  }

  this.isValidated = false; // Reset validation when cart changes
  return this;
};

// Instance method to update item quantity
cartSchema.methods.updateItemQuantity = function (itemId, quantity) {
  const item = this.items.id(itemId);
  if (!item) {
    throw new Error("Item not found in cart");
  }

  if (quantity <= 0) {
    this.items.pull(itemId);
  } else {
    item.quantity = quantity;

    // Recalculate total price
    let totalPrice = quantity * item.price;
    if (item.customizations?.addOns?.length) {
      const addOnPrice = item.customizations.addOns.reduce(
        (total, addOn) => total + addOn.price,
        0
      );
      totalPrice += addOnPrice * quantity;
    }

    item.totalPrice = totalPrice;
  }

  this.isValidated = false;
  return this;
};

// Instance method to remove item from cart
cartSchema.methods.removeItem = function (itemId) {
  this.items.pull(itemId);
  this.isValidated = false;
  return this;
};

// Instance method to clear cart
cartSchema.methods.clearCart = function () {
  this.items = [];
  this.subtotal = 0;
  this.totalItems = 0;
  this.isValidated = false;
  this.validationErrors = [];
  return this;
};

// Instance method to validate cart items
cartSchema.methods.validateItems = async function () {
  const validationErrors = [];

  // Populate all food items at once instead of individually
  await this.populate("items.foodItem");

  for (const item of this.items) {
    if (!item.foodItem) {
      validationErrors.push({
        itemId: item._id,
        error: "Food item no longer exists",
      });
      continue;
    }

    if (!item.foodItem.isAvailable) {
      validationErrors.push({
        itemId: item._id,
        error: "Food item is currently unavailable",
      });
    }

    if (
      item.foodItem.isLimitedQuantity &&
      item.foodItem.quantityAvailable !== null &&
      item.quantity > item.foodItem.quantityAvailable
    ) {
      validationErrors.push({
        itemId: item._id,
        error: `Only ${item.foodItem.quantityAvailable} items available`,
      });
    }

    // Check if price has changed
    const currentPrice = item.foodItem.discountPrice || item.foodItem.price;
    if (item.price !== currentPrice) {
      validationErrors.push({
        itemId: item._id,
        error: `Price has changed from ₹${item.price} to ₹${currentPrice}`,
      });
    }
  }

  this.validationErrors = validationErrors;
  this.isValidated = validationErrors.length === 0;

  return {
    isValid: this.isValidated,
    errors: validationErrors,
  };
};

export const Cart = mongoose.model("Cart", cartSchema);

// Validation schemas
export const cartValidationSchemas = {
  addItem: Joi.object({
    foodItem: Joi.string().length(24).hex().required().messages({
      "string.length": "Food item ID must be 24 characters",
      "string.hex": "Food item ID must be valid",
      "any.required": "Food item is required",
    }),
    quantity: Joi.number().integer().min(1).max(20).required().messages({
      "number.min": "Quantity must be at least 1",
      "number.max": "Maximum 20 items allowed per food item",
      "any.required": "Quantity is required",
    }),
    hotel: Joi.string().length(24).hex().required().messages({
      "any.required": "Hotel is required",
    }),
    branch: Joi.string().length(24).hex().optional().allow(null, "").messages({
      "string.length": "Branch ID must be 24 characters",
      "string.hex": "Branch ID must be valid",
    }),
    customizations: Joi.object({
      spiceLevel: Joi.string().valid("mild", "medium", "hot", "extra-hot"),
      size: Joi.string().valid("small", "medium", "large", "extra-large"),
      addOns: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          price: Joi.number().min(0).required(),
        })
      ),
      removedIngredients: Joi.array().items(Joi.string()),
      specialInstructions: Joi.string().max(200),
    }).optional(),
  }),

  updateQuantity: Joi.object({
    quantity: Joi.number().integer().min(0).max(20).required().messages({
      "number.min": "Quantity must be at least 0",
      "number.max": "Maximum 20 items allowed per food item",
      "any.required": "Quantity is required",
    }),
  }),

  updateCustomizations: Joi.object({
    customizations: Joi.object({
      spiceLevel: Joi.string().valid("mild", "medium", "hot", "extra-hot"),
      size: Joi.string().valid("small", "medium", "large", "extra-large"),
      addOns: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          price: Joi.number().min(0).required(),
        })
      ),
      removedIngredients: Joi.array().items(Joi.string()),
      specialInstructions: Joi.string().max(200),
    }).required(),
  }),
};

// Legacy validation functions for backward compatibility
export const validateAddToCart = (data) => {
  return cartValidationSchemas.addItem.validate(data);
};

export const validateUpdateQuantity = (data) => {
  return cartValidationSchemas.updateQuantity.validate(data);
};
