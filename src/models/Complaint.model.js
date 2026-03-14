import mongoose from "mongoose";

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
      enum: [
        "pending",
        "in_progress",
        "resolved",
        "escalated",
        "cancelled",
        "reopened",
      ],
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
          enum: [
            "pending",
            "in_progress",
            "resolved",
            "escalated",
            "cancelled",
            "reopened",
          ],
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
// Validators extracted to src/validators/complaint.validators.js
export { validateCreateComplaint, validateFollowUpMessage, validateRating, validateReopenRequest, validateStatusUpdate, validateComplaintResponse, validateGetComplaintsQuery } from "../validators/complaint.validators.js";
