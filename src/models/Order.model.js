import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import Joi from "joi";

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: false,
      default: null,
    },
    table: { type: mongoose.Schema.Types.ObjectId, ref: "Table" },
    tableNumber: { type: String }, // Cached table number for easy access
    staff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    items: [
      {
        foodItem: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "FoodItem",
          required: true,
        },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        totalPrice: { type: Number, required: true, min: 0 },
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
          removedIngredients: [String],
          specialInstructions: {
            type: String,
            maxlength: 200,
          },
        },
        // Cached food item details for order history
        foodItemName: { type: String, required: true },
        foodType: { type: String },
        category: { type: String },
      },
    ],
    status: {
      type: String,
      enum: [
        "pending",
        "preparing",
        "ready",
        "served",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },
    // Pricing breakdown
    subtotal: { type: Number, required: true, min: 0 },
    taxes: { type: Number, default: 0, min: 0 },
    serviceCharge: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },

    // Payment details
    payment: {
      paymentMethod: {
        type: String,
        enum: ["cash", "card", "upi", "wallet", "phonepe"],
        default: "cash",
      },
      paymentStatus: {
        type: String,
        enum: [
          "pending",
          "paid",
          "failed",
          "refund_pending",
          "refunded",
          "cancelled",
        ],
        default: "pending",
      },
      transactionId: {
        type: String,
        sparse: true, // Allow null values but ensure uniqueness when present
      },
      gatewayTransactionId: {
        type: String,
        sparse: true,
      },
      paidAt: {
        type: Date,
      },
      gatewayResponse: {
        type: Object, // Store raw gateway response
      },
      refund: {
        transactionId: String,
        amount: Number,
        reason: String,
        initiatedAt: Date,
        completedAt: Date,
        gatewayResponse: Object,
      },
    },

    // Order timing
    estimatedTime: { type: Number }, // in minutes
    actualPrepTime: { type: Number }, // in minutes

    // Order details
    specialInstructions: { type: String, maxlength: 500 },
    orderSource: {
      type: String,
      enum: ["mobile_app", "web_app", "pos", "phone", "reorder"],
      default: "mobile_app",
    },

    // Cancellation details
    cancellationReason: { type: String },
    cancelledAt: { type: Date },

    // Reorder tracking
    reorderedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },

    // Reward points
    rewardCoins: { type: Number, default: 0, min: 0 },
    rewardPointsUsed: { type: Number, default: 0, min: 0 },

    // Staff assignment and tracking
    preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    servedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },

    // Timestamps for status changes
    statusHistory: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
        notes: { type: String },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
orderSchema.index({ user: 1 });
orderSchema.index({ hotel: 1, branch: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ "items.foodItem": 1 });
orderSchema.index({ table: 1 });

// Virtual for order duration
orderSchema.virtual("orderDuration").get(function () {
  if (this.status === "completed" || this.status === "cancelled") {
    return Math.ceil((this.updatedAt - this.createdAt) / (1000 * 60)); // in minutes
  }
  return null;
});

// Virtual for total items count
orderSchema.virtual("totalItems").get(function () {
  if (!this.items || !Array.isArray(this.items)) {
    return 0;
  }
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Pre-save middleware to update status history
orderSchema.pre("save", function (next) {
  if (this.isModified("status") && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
    });
  }

  // If this is a new order, add initial status
  if (this.isNew) {
    this.statusHistory = [
      {
        status: this.status,
        timestamp: new Date(),
      },
    ];
  }

  next();
});

// Add pagination plugin
orderSchema.plugin(mongoosePaginate);

export const Order = mongoose.model("Order", orderSchema);

export const validateOrder = (data) => {
  const schema = Joi.object({
    user: Joi.string().length(24).hex().required(),
    hotel: Joi.string().length(24).hex().required(),
    branch: Joi.string().length(24).hex().optional().allow(null),
    table: Joi.string().length(24).hex().optional(),
    items: Joi.array()
      .items(
        Joi.object({
          foodItem: Joi.string().length(24).hex().required(),
          quantity: Joi.number().min(1).required(),
          price: Joi.number().min(0).required(),
          totalPrice: Joi.number().min(0).required(),
          customizations: Joi.object({
            spiceLevel: Joi.string().valid(
              "mild",
              "medium",
              "hot",
              "extra-hot"
            ),
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
          foodItemName: Joi.string().required(),
          foodType: Joi.string().optional(),
          category: Joi.string().optional(),
        })
      )
      .min(1)
      .required(),
    subtotal: Joi.number().min(0).required(),
    taxes: Joi.number().min(0).optional(),
    serviceCharge: Joi.number().min(0).optional(),
    totalPrice: Joi.number().min(0).required(),
    payment: Joi.object({
      paymentMethod: Joi.string()
        .valid("cash", "card", "upi", "wallet", "phonepe")
        .optional(),
      paymentStatus: Joi.string()
        .valid(
          "pending",
          "paid",
          "failed",
          "refund_pending",
          "refunded",
          "cancelled"
        )
        .optional(),
      transactionId: Joi.string().optional(),
      gatewayTransactionId: Joi.string().optional(),
      paidAt: Joi.date().optional(),
      gatewayResponse: Joi.object().optional(),
      refund: Joi.object({
        transactionId: Joi.string().optional(),
        amount: Joi.number().min(0).optional(),
        reason: Joi.string().optional(),
        initiatedAt: Joi.date().optional(),
        completedAt: Joi.date().optional(),
        gatewayResponse: Joi.object().optional(),
      }).optional(),
    }).optional(),
    specialInstructions: Joi.string().max(500).optional(),
    estimatedTime: Joi.number().min(1).optional(),
  });
  return schema.validate(data);
};
