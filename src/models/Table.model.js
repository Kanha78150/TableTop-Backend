import mongoose from "mongoose";
import Joi from "joi";

const tableSchema = new mongoose.Schema(
  {
    tableNumber: {
      type: String,
      required: [true, "Table number is required"],
      trim: true,
    },
    uniqueId: {
      type: String,
      unique: true,
      // Note: Generated automatically by pre-save hook, so not required in validation
    },
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: [true, "Hotel reference is required"],
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: false, // Optional for hotels without branches
    },
    // QR Code related fields
    qrCode: {
      data: {
        type: String,
        required: [true, "QR code data is required"],
      },
      image: {
        type: String,
        required: [true, "QR code image is required"],
      }, // Base64 encoded QR code image
      scanUrl: {
        type: String,
        required: [true, "Scan URL is required"],
      }, // Full URL that QR redirects to
      generatedAt: {
        type: Date,
        default: Date.now,
      },
    },
    // Table status and booking
    status: {
      type: String,
      enum: ["available", "occupied", "reserved", "maintenance", "inactive"],
      default: "available",
    },
    capacity: {
      type: Number,
      required: [true, "Table capacity is required"],
      min: [1, "Capacity must be at least 1"],
      max: [20, "Capacity cannot exceed 20"],
    },

    // Current booking/order information
    currentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    currentCustomer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Booking and usage tracking
    lastUsed: { type: Date },
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    // Admin management
    isActive: { type: Boolean, default: true },
    notes: {
      type: String,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
tableSchema.index({ hotel: 1, branch: 1 });
tableSchema.index({ hotel: 1, tableNumber: 1 });
tableSchema.index({ status: 1 });
tableSchema.index({ "qrCode.data": 1 });

// Ensure unique table number per hotel-branch combination
tableSchema.index(
  { hotel: 1, branch: 1, tableNumber: 1 },
  { unique: true, sparse: true }
);

// Virtual for table identifier
tableSchema.virtual("identifier").get(function () {
  return `${this.hotel}-${this.branch || "main"}-${this.tableNumber}`;
});

// Virtual for QR scan data object
tableSchema.virtual("qrScanData").get(function () {
  return {
    hotelId: this.hotel,
    branchId: this.branch,
    tableNo: this.tableNumber,
    tableId: this._id,
  };
});

// Pre-save middleware to generate unique ID
tableSchema.pre("save", async function (next) {
  if (this.isNew && !this.uniqueId) {
    this.uniqueId = `TBL-${this.hotel}-${this.branch || "MAIN"}-${
      this.tableNumber
    }-${Date.now()}`;
  }
  next();
});

// Instance method to update table status
tableSchema.methods.updateStatus = function (
  status,
  customer = null,
  order = null
) {
  this.status = status;

  if (status === "occupied") {
    this.currentCustomer = customer;
    this.currentOrder = order;
    this.lastUsed = new Date();
  } else if (status === "available") {
    this.currentCustomer = null;
    this.currentOrder = null;
  }

  return this.save();
};

// Instance method to record order completion
tableSchema.methods.recordOrderCompletion = function (orderValue) {
  this.totalOrders += 1;
  this.totalRevenue += orderValue || 0;
  this.status = "available";
  this.currentCustomer = null;
  this.currentOrder = null;

  return this.save();
};

// Static method to find available tables
tableSchema.statics.findAvailable = function (
  hotelId,
  branchId = null,
  capacity = null
) {
  const query = {
    hotel: hotelId,
    status: "available",
    isActive: true,
  };

  if (branchId) query.branch = branchId;
  if (capacity) query.capacity = { $gte: capacity };

  return this.find(query)
    .populate("hotel", "name location")
    .populate("branch", "name location")
    .sort({ tableNumber: 1 });
};

// Static method to get table by scan data
tableSchema.statics.findByQRData = function (hotelId, branchId, tableNo) {
  const query = {
    hotel: hotelId,
    tableNumber: tableNo,
    isActive: true,
  };

  if (branchId && branchId !== "null" && branchId !== "undefined") {
    query.branch = branchId;
  }

  return this.findOne(query)
    .populate("hotel", "name location contact status")
    .populate("branch", "name location contact status");
};

export const Table = mongoose.model("Table", tableSchema);

// Validation schemas
export const tableValidationSchemas = {
  createTable: Joi.object({
    tableNumber: Joi.string().required().messages({
      "any.required": "Table number is required",
      "string.empty": "Table number cannot be empty",
    }),
    hotel: Joi.string().length(24).hex().required().messages({
      "any.required": "Hotel ID is required",
      "string.length": "Hotel ID must be 24 characters",
      "string.hex": "Hotel ID must be valid",
    }),
    branch: Joi.string().length(24).hex().optional().messages({
      "string.length": "Branch ID must be 24 characters",
      "string.hex": "Branch ID must be valid",
    }),
    capacity: Joi.number().integer().min(1).max(20).required().messages({
      "any.required": "Table capacity is required",
      "number.min": "Capacity must be at least 1",
      "number.max": "Capacity cannot exceed 20",
    }),
    notes: Joi.string().max(500).optional().messages({
      "string.max": "Notes cannot exceed 500 characters",
    }),
  }),

  generateQRBulk: Joi.object({
    hotel: Joi.string().length(24).hex().required().messages({
      "any.required": "Hotel ID is required",
      "string.length": "Hotel ID must be 24 characters",
      "string.hex": "Hotel ID must be valid",
    }),
    branch: Joi.string().length(24).hex().optional().messages({
      "string.length": "Branch ID must be 24 characters",
      "string.hex": "Branch ID must be valid",
    }),
    totalTables: Joi.number().integer().min(1).max(100).required().messages({
      "any.required": "Total tables count is required",
      "number.min": "Must generate at least 1 table",
      "number.max": "Cannot generate more than 100 tables at once",
    }),
    startingNumber: Joi.number().integer().min(1).default(1).messages({
      "number.min": "Starting number must be at least 1",
    }),
    capacity: Joi.number().integer().min(1).max(20).default(4).messages({
      "number.min": "Capacity must be at least 1",
      "number.max": "Capacity cannot exceed 20",
    }),
  }),

  qrScan: Joi.object({
    hotelId: Joi.string().length(24).hex().required().messages({
      "any.required": "Hotel ID is required",
      "string.length": "Hotel ID must be 24 characters",
      "string.hex": "Hotel ID must be valid",
    }),
    branchId: Joi.string()
      .length(24)
      .hex()
      .optional()
      .allow(null, "")
      .messages({
        "string.length": "Branch ID must be 24 characters",
        "string.hex": "Branch ID must be valid",
      }),
    tableNo: Joi.string().required().messages({
      "any.required": "Table number is required",
      "string.empty": "Table number cannot be empty",
    }),
  }),
};

// Legacy validation functions for backward compatibility
export const validateTable = (data) => {
  return tableValidationSchemas.createTable.validate(data);
};

export const validateQRGeneration = (data) => {
  return tableValidationSchemas.generateQRBulk.validate(data);
};

export const validateQRScan = (data) => {
  return tableValidationSchemas.qrScan.validate(data);
};
