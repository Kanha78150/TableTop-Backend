// src/controllers/user/complaintController.js - User Complaint Management Controller

import {
  Complaint,
  validateCreateComplaint,
  validateFollowUpMessage,
  validateRating,
  validateReopenRequest,
} from "../../models/Complaint.model.js";
import { Order } from "../../models/Order.model.js";
import { RefundRequest } from "../../models/RefundRequest.model.js";
import { Counter } from "../../models/Counter.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { uploadToCloudinary } from "../../utils/cloudinary.js";
import {
  emitComplaintNew,
  emitComplaintUpdate,
} from "../../socket/complaintEvents.js";
import { getIO } from "../../utils/socketService.js";

import fs from "fs";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";


/**
 * Submit a new complaint
 * POST /api/v1/user/complaints
 * @access User
 */
export const submitComplaint = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      title,
      description,
      category,
      priority,
      orderId,
      contactMethod,
      requestRefund,
      refundAmount,
    } = req.body;

    // Validate request
    const { error } = validateCreateComplaint(req.body);
    if (error) {
      // Clean up uploaded files on validation error
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return next(new APIError(400, "Validation failed", error.details));
    }

    let orderDetails = null;
    let hotelId = null;
    let branchId = null;

    // If order ID provided, verify and get order details
    if (orderId) {
      orderDetails = await Order.findById(orderId).populate("branch");

      if (!orderDetails) {
        if (req.files) {
          req.files.forEach((file) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return next(new APIError(404, "Order not found"));
      }

      // Verify order belongs to user
      if (orderDetails.user.toString() !== userId.toString()) {
        if (req.files) {
          req.files.forEach((file) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return next(
          new APIError(
            403,
            "You can only create complaints for your own orders"
          )
        );
      }

      hotelId = orderDetails.hotel;
      branchId = orderDetails.branch._id;
    } else {
      // If no order, branch and hotel must be provided in body
      if (!req.body.branchId) {
        if (req.files) {
          req.files.forEach((file) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return next(
          new APIError(400, "Branch ID is required when no order is specified")
        );
      }
      branchId = req.body.branchId;
      hotelId = req.body.hotelId;
    }

    // Generate unique complaint ID using Counter
    const counter = await Counter.findOneAndUpdate(
      { _id: "complaintId" },
      { $inc: { sequence_value: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const complaintId = `CMP-${String(counter.sequence_value).padStart(
      6,
      "0"
    )}`;

    // Handle file uploads (attachments)
    const attachments = [];
    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          const cloudinaryResponse = await uploadToCloudinary(file.path);
          attachments.push({
            name: file.originalname,
            url: cloudinaryResponse.secure_url || cloudinaryResponse.url,
            uploadedAt: new Date(),
          });
          // Remove local file after upload
          fs.unlinkSync(file.path);
        }
      } catch (uploadError) {
        logger.error("File upload failed:", uploadError);
        // Clean up remaining files
        if (req.files) {
          req.files.forEach((file) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return next(new APIError(500, "Failed to upload attachments"));
      }
    }

    // Create complaint
    const complaint = new Complaint({
      complaintId,
      title,
      description,
      category,
      priority: priority || "medium",
      status: "pending",
      user: userId,
      hotel: hotelId,
      branch: branchId,
      order: orderId || undefined,
      contactMethod: contactMethod || "email",
      attachments,
      statusHistory: [
        {
          status: "pending",
          updatedBy: userId,
          updatedByModel: "User",
          timestamp: new Date(),
          notes: "Complaint submitted",
        },
      ],
      updatedBy: {
        userType: "user",
        userId,
        timestamp: new Date(),
      },
    });

    await complaint.save();

    logger.info(`Complaint ${complaintId} created by user ${userId}`);

    // Handle refund request if requested
    let refundRequest = null;
    if (requestRefund === true && orderId) {
      try {
        const refAmount = refundAmount || orderDetails.totalPrice;

        refundRequest = new RefundRequest({
          user: userId,
          order: orderId,
          amount: refAmount,
          reason: `Related to complaint #${complaintId}: ${description.substring(
            0,
            100
          )}`,
          status: "pending",
          attachments: attachments, // Use same attachments
        });

        await refundRequest.save();

        // Link refund to complaint
        complaint.refundRequest = refundRequest._id;
        await complaint.save();

        logger.info(
          `Refund request created and linked to complaint ${complaintId}: ${refundRequest._id}`
        );
      } catch (refundError) {
        logger.error("Error creating refund request:", refundError);
        // Don't block complaint creation if refund fails
      }
    }

    // Emit socket event to notify managers in the hotel
    try {
      const io = getIO();

      const complaintData = {
        _id: complaint._id,
        complaintId: complaint.complaintId,
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        priority: complaint.priority,
        status: complaint.status,
        user: { _id: userId, name: req.user.name, phone: req.user.phone },
        createdAt: complaint.createdAt,
        message: `New ${complaint.priority} priority complaint submitted`,
      };

      // Emit to branch room (branch managers) and hotel room (admins)
      // Note: Managers join both hotel and branch rooms, so we emit to branch only to avoid duplicates
      // Admins will receive it through hotel room
      if (branchId) {
        io.to(`branch_${branchId}`).emit("complaint:new", complaintData);
      }

      // console.log("\n🔔 Socket Event Emitted:");
      // console.log("Event: complaint:new");
      // console.log("Room:", `branch_${branchId}`);
      // console.log("Complaint ID:", complaintId);
      // console.log("Title:", complaint.title);
      // console.log("Priority:", complaint.priority);
      // console.log("Data:", JSON.stringify(complaintData, null, 2));
      logger.info("\n🔔 Socket Event Emitted:");
      logger.info("Event: complaint:new");
      logger.info(`Room: branch_${branchId}`);
      logger.info(`Complaint ID: ${complaintId}`);
      logger.info(`Title: ${complaint.title}`);
      logger.info(`Priority: ${complaint.priority}`);
      logger.info(`Data: ${JSON.stringify(complaintData, null, 2)}`);

      logger.info(
        `Socket event 'complaint:new' emitted to branch ${branchId} for complaint ${complaintId}`
      );
    } catch (socketError) {
      // console.error("❌ Socket emission error:", socketError);
      logger.error(
        "Error emitting socket event for new complaint:",
        socketError
      );
      // Don't block complaint creation if socket emission fails
    }

    const responseData = refundRequest
      ? {
          complaint,
          refundRequest,
          message: "Refund request also created and linked",
        }
      : { complaint };

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          responseData,
          `Complaint submitted successfully. Your complaint ID is ${complaintId}${
            refundRequest ? ". Refund request also created." : ""
          }`
        )
      );
  } catch (error) {
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach((file) => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    logger.error("Error submitting complaint:", error);
    next(error);
  }
};

/**
 * Get all complaints for the logged-in user
 * GET /api/v1/user/complaints
 * @access User
 */
export const getMyComplaints = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    status,
    priority,
    category,
    page,
    limit,
    sortBy,
    sortOrder,
    search,
    startDate,
    endDate,
  } = req.query;

  // Build filter
  const filter = { user: userId };

  if (status && status !== "all") {
    filter.status = status;
  }

  if (priority && priority !== "all") {
    filter.priority = priority;
  }

  if (category && category !== "all") {
    filter.category = category;
  }

  // Date range filter
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // Search filter
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { complaintId: { $regex: search, $options: "i" } },
    ];
  }

  // Pagination
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sort = {};
  sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

  // Get complaints
  const complaints = await Complaint.find(filter)
    .populate("order", "orderId totalPrice createdAt")
    .populate("assignedTo", "name staffId")
    .populate("branch", "name location")
    .sort(sort)
    .skip(skip)
    .limit(limitNum)
    .select("-internalNotes"); // Don't show internal notes to users

  const total = await Complaint.countDocuments(filter);

  res.status(200).json(
    new APIResponse(
      200,
      {
        complaints,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          total,
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1,
        },
      },
      "Complaints retrieved successfully"
    )
  );
  });

/**
 * Get complaint details by ID
 * GET /api/v1/user/complaints/:complaintId
 * @access User
 */
export const getComplaintDetails = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { complaintId } = req.params;

  // Validate complaint ID format
  if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid complaint ID"));
  }

  const complaint = await Complaint.findById(complaintId)
    .populate("user", "name phone email")
    .populate("order", "orderId items totalPrice createdAt status")
    .populate("branch", "name location phone")
    .populate("hotel", "name")
    .populate("assignedTo", "name staffId")
    .populate("resolvedBy", "name")
    .populate({
      path: "responses.respondedBy.userId",
      select: "name",
    })
    .select("-internalNotes"); // Hide internal notes from users

  if (!complaint) {
    return next(new APIError(404, "Complaint not found"));
  }

  // Verify complaint belongs to user
  if (complaint.user._id.toString() !== userId.toString()) {
    return next(new APIError(403, "You can only view your own complaints"));
  }

  // Filter responses to show only public ones
  if (complaint.responses && complaint.responses.length > 0) {
    complaint.responses = complaint.responses.filter(
      (response) => response.isPublic === true
    );
  }

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { complaint },
        "Complaint details retrieved successfully"
      )
    );
  });

/**
 * Add follow-up message to complaint
 * POST /api/v1/user/complaints/:complaintId/followup
 * @access User
 */
export const addFollowUpMessage = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { complaintId } = req.params;
    const { message } = req.body;

    // Validate
    if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return next(new APIError(400, "Invalid complaint ID"));
    }

    const { error } = validateFollowUpMessage({ message, complaintId });
    if (error) {
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return next(new APIError(400, "Validation failed", error.details));
    }

    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return next(new APIError(404, "Complaint not found"));
    }

    // Verify complaint belongs to user
    if (complaint.user.toString() !== userId.toString()) {
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return next(
        new APIError(403, "You can only add messages to your own complaints")
      );
    }

    // Check if complaint is resolved or cancelled
    if (complaint.status === "resolved" || complaint.status === "cancelled") {
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return next(
        new APIError(
          400,
          `Cannot add follow-up to ${complaint.status} complaint. Please reopen if needed.`
        )
      );
    }

    // Handle file uploads for follow-up
    const attachments = [];
    if (req.files && req.files.length > 0) {
      try {
        for (const file of req.files) {
          const cloudinaryResponse = await uploadToCloudinary(file.path);
          attachments.push({
            name: file.originalname,
            url: cloudinaryResponse.secure_url || cloudinaryResponse.url,
            uploadedAt: new Date(),
          });
          fs.unlinkSync(file.path);
        }
      } catch (uploadError) {
        logger.error("File upload failed:", uploadError);
        if (req.files) {
          req.files.forEach((file) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return next(new APIError(500, "Failed to upload attachments"));
      }
    }

    // Add response
    complaint.responses.push({
      message,
      respondedBy: {
        userType: "user",
        userId,
      },
      respondedAt: new Date(),
      isPublic: true,
      attachments,
    });

    complaint.updatedBy = {
      userType: "user",
      userId,
      timestamp: new Date(),
    };

    await complaint.save();

    logger.info(`User ${userId} added follow-up to complaint ${complaintId}`);

    try {
      const io = getIO();
      emitComplaintUpdate(io, complaintId, {
        complaintId,
        userId: complaint.user,
        staffId: complaint.assignedTo,
        branchId: complaint.branch,
        type: "follow_up_added",
        message: "User added follow-up message to complaint",
        complaint: complaint.toObject(),
      });
      logger.info(
        `Socket event emitted for follow-up on complaint ${complaintId}`
      );
    } catch (socketError) {
      logger.error("Error emitting socket event for follow-up:", socketError);
      // Don't block operation if socket emission fails
    }

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { complaint },
          "Follow-up message added successfully"
        )
      );
  } catch (error) {
    if (req.files) {
      req.files.forEach((file) => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    logger.error("Error adding follow-up message:", error);
    next(error);
  }
};

/**
 * Rate complaint resolution
 * PUT /api/v1/user/complaints/:complaintId/rate
 * @access User
 */
export const rateResolution = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { complaintId } = req.params;
  const { rating, feedbackComment } = req.body;

  // Validate
  if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid complaint ID"));
  }

  const { error } = validateRating({ rating, feedbackComment, complaintId });
  if (error) {
    return next(new APIError(400, "Validation failed", error.details));
  }

  const complaint = await Complaint.findById(complaintId);

  if (!complaint) {
    return next(new APIError(404, "Complaint not found"));
  }

  // Verify complaint belongs to user
  if (complaint.user.toString() !== userId.toString()) {
    return next(new APIError(403, "You can only rate your own complaints"));
  }

  // Check if complaint is resolved
  if (complaint.status !== "resolved") {
    return next(new APIError(400, "Can only rate resolved complaints"));
  }

  // Check if already rated
  if (complaint.userRating) {
    return next(new APIError(400, "Complaint has already been rated"));
  }

  // Update rating
  complaint.userRating = rating;
  complaint.feedbackComment = feedbackComment || "";

  // If rating is low (≤ 2), allow reopening
  if (rating <= 2) {
    complaint.canReopen = true;
  }

  complaint.updatedBy = {
    userType: "user",
    userId,
    timestamp: new Date(),
  };

  await complaint.save();

  logger.info(
    `User ${userId} rated complaint ${complaintId} with ${rating} stars`
  );

  // TODO: If rating <= 2, alert manager (Phase 7)

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { complaint },
        "Thank you for rating the resolution"
      )
    );
  });

/**
 * Reopen a resolved complaint
 * PUT /api/v1/user/complaints/:complaintId/reopen
 * @access User
 */
export const reopenComplaint = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { complaintId } = req.params;
  const { reason } = req.body;

  // Validate
  if (!complaintId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid complaint ID"));
  }

  const { error } = validateReopenRequest({ reason, complaintId });
  if (error) {
    return next(new APIError(400, "Validation failed", error.details));
  }

  const complaint = await Complaint.findById(complaintId);

  if (!complaint) {
    return next(new APIError(404, "Complaint not found"));
  }

  // Verify complaint belongs to user
  if (complaint.user.toString() !== userId.toString()) {
    return next(new APIError(403, "You can only reopen your own complaints"));
  }

  // Check if complaint is resolved
  if (complaint.status !== "resolved") {
    return next(new APIError(400, "Can only reopen resolved complaints"));
  }

  // Check if can reopen
  if (!complaint.canReopen) {
    return next(new APIError(400, "This complaint cannot be reopened"));
  }

  // Check if within 1 day of resolution
  const daysSinceResolution =
    (new Date() - complaint.resolvedAt) / (1000 * 60 * 60 * 24);
  if (daysSinceResolution > 1) {
    return next(
      new APIError(
        400,
        "Complaints can only be reopened within 1 day of resolution"
      )
    );
  }

  // Reopen complaint
  complaint.status = "reopened";
  complaint.canReopen = false; // Can't reopen again
  complaint.assignedTo = null; // Reset assignment
  complaint.priority = "high"; // Boost priority

  // Add to status history
  complaint.statusHistory.push({
    status: "reopened",
    updatedBy: userId,
    updatedByModel: "User",
    timestamp: new Date(),
    notes: `Reopened by user. Reason: ${reason}`,
  });

  // Add response with reason
  complaint.responses.push({
    message: `Complaint reopened. Reason: ${reason}`,
    respondedBy: {
      userType: "user",
      userId,
    },
    respondedAt: new Date(),
    isPublic: true,
    attachments: [],
  });

  complaint.updatedBy = {
    userType: "user",
    userId,
    timestamp: new Date(),
  };

  await complaint.save();

  logger.info(`User ${userId} reopened complaint ${complaintId}`);

  // Emit socket event to notify manager and assigned staff
  try {
    const io = getIO();
    emitComplaintUpdate(io, complaintId, {
      complaintId,
      userId: complaint.user,
      branchId: complaint.branch,
      staffId: complaint.assignedTo,
      type: "reopened",
      message: "Complaint reopened by user",
      complaint: complaint.toObject(),
      reason,
    });
    logger.info(`Socket event emitted for reopened complaint ${complaintId}`);
  } catch (socketError) {
    logger.error(
      "Error emitting socket event for reopened complaint:",
      socketError
    );
    // Don't block operation if socket emission fails
  }

  res
    .status(200)
    .json(
      new APIResponse(200, { complaint }, "Complaint reopened successfully")
    );
  });

/**
 * Get user's complaint dashboard summary
 * GET /api/v1/user/complaints/dashboard
 * @access User
 */
export const getMyComplaintsDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get counts by status
  const statusCounts = await Complaint.aggregate([
    { $match: { user: userId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  // Get average resolution time for user's resolved complaints
  const resolutionTimes = await Complaint.aggregate([
    {
      $match: {
        user: userId,
        status: "resolved",
        resolvedAt: { $exists: true },
      },
    },
    {
      $project: {
        resolutionTime: {
          $divide: [
            { $subtract: ["$resolvedAt", "$createdAt"] },
            1000 * 60 * 60,
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        avgResolutionTime: { $avg: "$resolutionTime" },
      },
    },
  ]);

  // Get recent complaints (last 5)
  const recentComplaints = await Complaint.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("complaintId title status priority createdAt")
    .populate("branch", "name");

  // Get average rating given by user
  const ratingStats = await Complaint.aggregate([
    { $match: { user: userId, userRating: { $exists: true } } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$userRating" },
        totalRated: { $sum: 1 },
      },
    },
  ]);

  const dashboard = {
    statusCounts: statusCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    avgResolutionTime: resolutionTimes[0]?.avgResolutionTime || 0,
    recentComplaints,
    avgRating: ratingStats[0]?.avgRating || 0,
    totalRated: ratingStats[0]?.totalRated || 0,
  };

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { dashboard },
        "Dashboard data retrieved successfully"
      )
    );
  });
