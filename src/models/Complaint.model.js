import mongoose from "mongoose";
import Joi from "joi";

const complaintSchema = new mongoose.Schema(
  {
    // Unique identifier
    complaintId: {
      type: String,
      unique: true,
      required: true,
    },

    // Core fields
    title: {
      type: String,
      required: true,
      minlength: 5,
      maxlength: 200,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      minlength: 20,
      maxlength: 2000,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "food_quality",
        "service",
        "cleanliness",
        "billing",
        "staff_behavior",
        "delivery",
        "hygiene",
        "other",
      ],
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "resolved", "escalated", "cancelled", "reopened"],
      default: "pending",
    },

    // References
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    refundRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefundRequest",
    },

    // Assignment & Resolution (Staff READ-ONLY, Manager/Admin UPDATE)
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manager",
    },
    assignedAt: {
      type: Date,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "resolvedByModel",
    },
    resolvedByModel: {
      type: String,
      enum: ["Manager", "Admin"],
    },
    resolvedAt: {
      type: Date,
    },
    closedAt: {
      type: Date,
    },

    // Staff tracking (for read-only access)
    staffViewedAt: {
      type: Date,
    },
    staffNotified: {
      type: Boolean,
      default: false,
    },

    // Tracking arrays
    statusHistory: [
      {
        status: {
          type: String,
          enum: ["pending", "in_progress", "resolved", "escalated", "cancelled", "reopened"],
        },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "statusHistory.updatedByModel",
        },
        updatedByModel: {
          type: String,
          enum: ["User", "Staff", "Manager", "Admin"],
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        notes: String,
      },
    ],

    responses: [
      {
        message: {
          type: String,
          required: true,
        },
        respondedBy: {
          userType: {
            type: String,
            enum: ["user", "staff", "manager", "admin"],
            required: true,
          },
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
          },
        },
        respondedAt: {
          type: Date,
          default: Date.now,
        },
        isPublic: {
          type: Boolean,
          default: true,
        },
        attachments: [
          {
            name: String,
            url: String,
            uploadedAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
      },
    ],

    attachments: [
      {
        name: String,
        url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Resolution details
    resolution: {
      type: String,
      maxlength: 1000,
    },
    internalNotes: {
      type: String,
      maxlength: 2000,
    },

    // Compensation
    coinCompensation: {
      type: Number,
      default: 0,
      min: 0,
    },

    // User satisfaction
    userRating: {
      type: Number,
      min: 1,
      max: 5,
    },
    feedbackComment: {
      type: String,
      maxlength: 500,
    },
    canReopen: {
      type: Boolean,
      default: true,
    },

    // Contact preferences
    contactMethod: {
      type: String,
      enum: ["phone", "email", "in_person"],
    },

    // Escalation
    escalatedAt: {
      type: Date,
    },
    escalationReason: {
      type: String,
      maxlength: 500,
    },

    // Tracking last update
    updatedBy: {
      userType: {
        type: String,
        enum: ["user", "staff", "manager", "admin"],
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
      },
      timestamp: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
complaintSchema.index({ user: 1, status: 1, createdAt: -1 });
complaintSchema.index({ branch: 1, priority: 1, status: 1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
// complaintId index handled by unique: true in schema definition
complaintSchema.index({ order: 1 });
complaintSchema.index({ status: 1, priority: 1, createdAt: -1 });

// Text index for search
complaintSchema.index({ title: "text", description: "text" });

export const Complaint = mongoose.model("Complaint", complaintSchema);

// Validation schemas for different operations

// User: Create complaint
export const validateCreateComplaint = (data) => {
  const schema = Joi.object({
    title: Joi.string().min(5).max(200).required(),
    description: Joi.string().min(20).max(2000).required(),
    category: Joi.string()
      .valid(
        "food_quality",
        "service",
        "cleanliness",
        "billing",
        "staff_behavior",
        "delivery",
        "hygiene",
        "other"
      )
      .required(),
    priority: Joi.string().valid("low", "medium", "high", "urgent").optional(),
    orderId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .optional(),
    contactMethod: Joi.string().valid("phone", "email", "in_person").optional(),
    requestRefund: Joi.boolean().optional(),
    refundAmount: Joi.number().positive().optional(),
    refundReason: Joi.string().min(10).max(500).optional(),
  });
  return schema.validate(data);
};

// User: Add follow-up message
export const validateFollowUpMessage = (data) => {
  const schema = Joi.object({
    message: Joi.string().min(5).max(1000).required(),
    complaintId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
  });
  return schema.validate(data);
};

// User: Rate resolution
export const validateRating = (data) => {
  const schema = Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    feedbackComment: Joi.string().max(500).optional(),
    complaintId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
  });
  return schema.validate(data);
};

// User: Reopen complaint
export const validateReopenRequest = (data) => {
  const schema = Joi.object({
    reason: Joi.string().min(20).max(500).required(),
    complaintId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
  });
  return schema.validate(data);
};

// Manager: Update status
export const validateStatusUpdate = (data) => {
  const schema = Joi.object({
    complaintId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required(),
    status: Joi.string()
      .valid("pending", "in_progress", "resolved", "escalated", "cancelled", "reopened")
      .required(),
    resolution: Joi.string().min(10).max(1000).when("status", {
      is: "resolved",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    internalNotes: Joi.string().max(2000).optional(),
  });
  return schema.validate(data);
};

// Manager: Add response
export const validateComplaintResponse = (data) => {
  const schema = Joi.object({
    message: Joi.string().min(5).max(1000).required(),
    isPublic: Joi.boolean().default(true),
  });
  return schema.validate(data);
};

// Get complaints query validation
export const validateGetComplaintsQuery = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid("all", "pending", "in_progress", "resolved", "escalated", "cancelled", "reopened")
      .optional(),
    priority: Joi.string().valid("all", "low", "medium", "high", "urgent").optional(),
    category: Joi.string()
      .valid(
        "all",
        "food_quality",
        "service",
        "cleanliness",
        "billing",
        "staff_behavior",
        "delivery",
        "hygiene",
        "other"
      )
      .optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    skip: Joi.number().integer().min(0).default(0),
    page: Joi.number().integer().min(1).default(1),
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "priority", "status", "resolvedAt")
      .default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
    search: Joi.string().max(200).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
  });
  return schema.validate(data);
};
