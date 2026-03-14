import Joi from "joi";

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
    branchId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .optional(),
    hotelId: Joi.string()
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
      .valid(
        "pending",
        "in_progress",
        "resolved",
        "escalated",
        "cancelled",
        "reopened"
      )
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
      .valid(
        "all",
        "pending",
        "in_progress",
        "resolved",
        "escalated",
        "cancelled",
        "reopened"
      )
      .optional(),
    priority: Joi.string()
      .valid("all", "low", "medium", "high", "urgent")
      .optional(),
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
    unassignedOnly: Joi.boolean().optional(),
    unviewedOnly: Joi.boolean().optional(),
  });
  return schema.validate(data);
};

