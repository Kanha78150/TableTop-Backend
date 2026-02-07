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

    // Order notification and acknowledgment tracking
    notificationSentAt: { type: Date },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    viewedAt: { type: Date },

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
        // GST details for this item
        gstRate: { type: Number, required: true },
        gstAmount: { type: Number, required: true, min: 0 },
      },
    ],
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
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
    originalPrice: { type: Number, min: 0 }, // Price before coin discount
    coinDiscount: { type: Number, default: 0, min: 0 }, // Discount from coins
    coinsUsed: { type: Number, default: 0, min: 0 }, // Number of coins used
    totalPrice: { type: Number, required: true, min: 0 },

    // Payment details
    payment: {
      paymentMethod: {
        type: String,
        enum: ["cash", "card", "upi", "wallet", "razorpay", "phonepe", "paytm"],
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

      // Multi-provider payment fields
      provider: {
        type: String,
        enum: ["razorpay", "phonepe", "paytm", "cash", "company"],
      },
      gatewayAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hotel", // Which hotel's payment gateway was used
      },
      transactionId: {
        type: String,
        sparse: true, // Allow null values but ensure uniqueness when present
      },
      gatewayTransactionId: {
        type: String,
        sparse: true,
      },
      razorpayOrderId: {
        type: String,
        sparse: true, // Razorpay order ID (order_xxxxx)
      },
      razorpayPaymentId: {
        type: String,
        sparse: true, // Razorpay payment ID (pay_xxxxx) - needed for refunds
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

      // Commission tracking for multi-provider system
      commissionAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      commissionRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 1,
      },
      commissionStatus: {
        type: String,
        enum: ["pending", "collected", "waived", "disputed"],
        default: "pending",
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

    // Waiter Assignment System Fields
    // Assignment tracking
    assignedAt: { type: Date },
    assignmentMethod: {
      type: String,
      enum: ["round-robin", "load-balancing", "manual", "queue"],
      default: "round-robin",
    },

    // Queue management
    queuePosition: { type: Number },
    queuedAt: { type: Date },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    priorityValue: { type: Number, default: 2 }, // For sorting (1=low, 2=normal, 3=high, 4=urgent)
    estimatedAssignmentTime: { type: Date },

    // Assignment history for tracking reassignments
    assignmentHistory: [
      {
        waiter: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Staff",
          required: true,
        },
        assignedAt: { type: Date, default: Date.now },
        method: {
          type: String,
          enum: ["round-robin", "load-balancing", "manual", "queue"],
          required: true,
        },
        reason: { type: String }, // manual assignment reason or system reason
        unassignedAt: { type: Date },
        unassignReason: { type: String },
      },
    ],

    // Performance tracking
    isTimeout: { type: Boolean, default: false },
    timeoutDetectedAt: { type: Date },
    actualServiceTime: { type: Number }, // in minutes from assignment to completion
    customerRating: { type: Number, min: 1, max: 5 }, // Optional customer feedback
    serviceNotes: { type: String }, // Internal notes about service quality

    // Review System Fields
    reviewInviteSentAt: { type: Date }, // When review invitation email was sent
    hasReview: { type: Boolean, default: false }, // Whether user submitted a review
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Review" }, // Reference to review

    // Timestamps for status changes
    statusHistory: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
        notes: { type: String },
      },
    ],

    // Invoice and Credit Note Fields
    invoiceNumber: {
      type: String,
      sparse: true,
      unique: true,
    },
    invoiceGeneratedAt: {
      type: Date,
    },
    invoiceSnapshot: {
      hotelName: String,
      hotelEmail: String,
      hotelPhone: String,
      hotelGSTIN: String,
      branchName: String,
      branchAddress: String,
      branchPhone: String,
      branchEmail: String,
      customerName: String,
      customerEmail: String,
      customerPhone: String,
      tableNumber: String,
    },
    creditNotes: [
      {
        creditNoteNumber: { type: String, required: true },
        refundRequestId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "RefundRequest",
        },
        amount: { type: Number, required: true },
        reason: String,
        generatedAt: { type: Date, default: Date.now },
      },
    ],
    invoiceDownloadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastInvoiceDownloadAt: {
      type: Date,
    },
    invoiceEmailStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "no_email", "generation_failed"],
      default: "pending",
    },
    invoiceEmailAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    invoiceGenerationError: {
      type: String,
    },
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

// Assignment system indexes
orderSchema.index({ staff: 1 });
orderSchema.index({ assignedAt: -1 });
orderSchema.index({ queuePosition: 1 });
orderSchema.index({ queuedAt: 1 });
orderSchema.index({ status: 1, hotel: 1, branch: 1 });
orderSchema.index({ priorityValue: -1, queuePosition: 1 });
orderSchema.index({ status: 1, staff: 1 }); // For counting active orders per waiter

// Invoice system indexes
orderSchema.index({ user: 1, invoiceDownloadCount: 1 });
orderSchema.index({ invoiceEmailStatus: 1 });

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

// Virtual for current assigned waiter
orderSchema.virtual("currentWaiter").get(function () {
  if (this.assignmentHistory && this.assignmentHistory.length > 0) {
    const lastAssignment =
      this.assignmentHistory[this.assignmentHistory.length - 1];
    if (!lastAssignment.unassignedAt) {
      return lastAssignment.waiter;
    }
  }
  return this.staff;
});

// Method to calculate actual service time
orderSchema.methods.calculateServiceTime = function () {
  if (
    this.assignedAt &&
    (this.status === "completed" || this.status === "served")
  ) {
    const endTime =
      this.status === "completed"
        ? this.updatedAt
        : this.statusHistory.find((s) => s.status === "served")?.timestamp ||
          this.updatedAt;
    return Math.ceil((endTime - this.assignedAt) / (1000 * 60)); // in minutes
  }
  return null;
};

// Method to update assignment history
orderSchema.methods.addAssignmentHistory = function (
  waiterId,
  method,
  reason = null
) {
  // Unassign previous waiter if exists
  if (this.assignmentHistory.length > 0) {
    const lastAssignment =
      this.assignmentHistory[this.assignmentHistory.length - 1];
    if (!lastAssignment.unassignedAt) {
      lastAssignment.unassignedAt = new Date();
      lastAssignment.unassignReason = reason || "reassignment";
    }
  }

  // Add new assignment
  this.assignmentHistory.push({
    waiter: waiterId,
    assignedAt: new Date(),
    method: method,
    reason: reason,
  });

  this.assignedAt = new Date();
  this.assignmentMethod = method;
  this.staff = waiterId;
};

// Invoice-related helper methods
orderSchema.methods.canDownloadInvoice = function () {
  // If no invoice generated yet, can't download
  if (!this.invoiceNumber) {
    return false;
  }

  // If never downloaded, allow
  if (!this.lastInvoiceDownloadAt) {
    return true;
  }

  const now = new Date();
  const lastDownload = new Date(this.lastInvoiceDownloadAt);

  // Check if in same month and year
  const sameMonth =
    now.getMonth() === lastDownload.getMonth() &&
    now.getFullYear() === lastDownload.getFullYear();

  // If different month, allow download
  if (!sameMonth) {
    return true;
  }

  // Same month - check if under 3 downloads
  return this.invoiceDownloadCount < 3;
};

orderSchema.methods.isFullyRefunded = function () {
  if (!this.creditNotes || this.creditNotes.length === 0) {
    return false;
  }

  const totalRefunded = this.creditNotes.reduce(
    (sum, cn) => sum + cn.amount,
    0
  );
  return totalRefunded >= this.totalPrice;
};

orderSchema.methods.needsCancelledStamp = function () {
  return this.payment.paymentStatus === "refunded" || this.isFullyRefunded();
};

orderSchema.methods.getTotalRefundAmount = function () {
  if (!this.creditNotes || this.creditNotes.length === 0) {
    return 0;
  }
  return this.creditNotes.reduce((sum, cn) => sum + cn.amount, 0);
};

orderSchema.methods.resetMonthlyDownloadCount = function () {
  const now = new Date();
  const lastDownload = this.lastInvoiceDownloadAt
    ? new Date(this.lastInvoiceDownloadAt)
    : null;

  if (!lastDownload) {
    return;
  }

  const sameMonth =
    now.getMonth() === lastDownload.getMonth() &&
    now.getFullYear() === lastDownload.getFullYear();

  if (!sameMonth) {
    this.invoiceDownloadCount = 0;
  }
};

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
        .valid("cash", "card", "upi", "wallet", "razorpay")
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
      razorpayOrderId: Joi.string().optional(),
      razorpayPaymentId: Joi.string().optional(),
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
