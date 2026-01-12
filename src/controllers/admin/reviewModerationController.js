// src/controllers/admin/reviewModerationController.js - Admin Review Moderation Controller
import mongoose from "mongoose";
import {
  Review,
  validateGetReviewsQuery,
  validateAdminResponse,
  validateRejectReview,
} from "../../models/Review.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import reviewService from "../../services/reviewService.js";
import reviewAnalyticsService from "../../services/reviewAnalyticsService.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { sendEmail } from "../../utils/emailService.js";

/**
 * Get all reviews with admin access control
 * GET /api/v1/admin/reviews
 * @access Admin
 */
export const getAllReviews = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const {
      status,
      hotelId,
      branchId,
      minRating,
      maxRating,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Validate query parameters
    const { error } = validateGetReviewsQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Build filter based on admin role
    let filter = {};

    // Branch admin can only see reviews for their hotels/branches
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id);

      filter = {
        hotel: { $in: hotelIds },
        branch: { $in: req.admin.assignedBranches },
      };
    }

    // Apply additional filters
    if (status && status !== "all") {
      filter.status = status;
    }

    if (hotelId) {
      filter.hotel = hotelId;
    }

    if (branchId) {
      filter.branch = branchId;
    }

    // Add rating filter if provided
    if (minRating || maxRating) {
      // This will be handled in aggregation
    }

    // Search in comment text
    if (search) {
      filter.comment = new RegExp(search, "i");
    }

    // Add date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Add one day to include the entire end date
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDateTime;
      }
    }

    // Pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Get reviews
    let query = Review.find(filter);

    // Add rating filter using $expr if needed
    if (minRating || maxRating) {
      const overallRating = {
        $divide: [
          {
            $add: [
              "$foodRating",
              "$hotelRating",
              "$branchRating",
              "$staffRating",
            ],
          },
          4,
        ],
      };

      const ratingFilter = {};
      if (minRating) {
        ratingFilter.$gte = [overallRating, parseFloat(minRating)];
      }
      if (maxRating) {
        ratingFilter.$lte = [overallRating, parseFloat(maxRating)];
      }

      query = query.where({
        $expr: { $and: Object.values(ratingFilter) },
      });
    }

    const [reviews, totalReviews] = await Promise.all([
      query
        .populate("user", "name email phone")
        .populate("order", "orderId totalPrice createdAt")
        .populate("hotel", "name hotelId")
        .populate("branch", "name branchId")
        .populate("moderatedBy", "name email")
        .populate("response.respondedBy", "name")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Review.countDocuments(filter),
    ]);

    // Add overall rating to each review
    const reviewsWithOverall = reviews.map((review) => ({
      ...review,
      overallRating: parseFloat(
        (
          (review.foodRating +
            review.hotelRating +
            review.branchRating +
            review.staffRating) /
          4
        ).toFixed(2)
      ),
    }));

    return res.status(200).json(
      new APIResponse(
        200,
        {
          reviews: reviewsWithOverall,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews,
            hasNextPage: page < Math.ceil(totalReviews / limit),
            hasPrevPage: page > 1,
          },
        },
        "Reviews retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting reviews:", error);
    next(error);
  }
};

/**
 * Get pending reviews for moderation
 * GET /api/v1/admin/reviews/pending
 * @access Admin
 */
export const getPendingReviews = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const { page = 1, limit = 20, hotelId, branchId } = req.query;

    // Build filter based on admin role
    let filter = { status: "pending" };

    // Branch admin can only see reviews for their hotels/branches
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id);

      filter.hotel = { $in: hotelIds };
      filter.branch = { $in: req.admin.assignedBranches };
    }

    // Apply additional filters
    if (hotelId) {
      filter.hotel = hotelId;
    }

    if (branchId) {
      filter.branch = branchId;
    }

    // Pagination
    const skip = (page - 1) * limit;

    const [reviews, totalReviews] = await Promise.all([
      Review.find(filter)
        .populate("user", "name email phone")
        .populate("order", "orderId totalPrice createdAt")
        .populate("hotel", "name hotelId")
        .populate("branch", "name branchId")
        .sort({ createdAt: 1 }) // Oldest first for moderation
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Review.countDocuments(filter),
    ]);

    // Add overall rating to each review
    const reviewsWithOverall = reviews.map((review) => ({
      ...review,
      overallRating: parseFloat(
        (
          (review.foodRating +
            review.hotelRating +
            review.branchRating +
            review.staffRating) /
          4
        ).toFixed(2)
      ),
    }));

    return res.status(200).json(
      new APIResponse(
        200,
        {
          reviews: reviewsWithOverall,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews,
            hasNextPage: page < Math.ceil(totalReviews / limit),
            hasPrevPage: page > 1,
          },
        },
        "Pending reviews retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting pending reviews:", error);
    next(error);
  }
};

/**
 * Approve a review
 * PUT /api/v1/admin/reviews/:reviewId/approve
 * @access Admin
 */
export const approveReview = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const { reviewId } = req.params;

    // Validate review ID
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return next(new APIError(400, "Invalid review ID"));
    }

    // Get review
    const review = await Review.findById(reviewId).populate("hotel branch");

    if (!review) {
      return next(new APIError(404, "Review not found"));
    }

    // Check admin access
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id.toString());

      if (
        !hotelIds.includes(review.hotel._id.toString()) ||
        !req.admin.assignedBranches.some((b) => b.equals(review.branch._id))
      ) {
        return next(
          new APIError(403, "You do not have access to moderate this review")
        );
      }
    }

    // Check if already approved
    if (review.status === "approved") {
      return next(new APIError(400, "Review is already approved"));
    }

    // Update review status
    review.status = "approved";
    review.moderatedBy = adminId;
    review.moderatedAt = new Date();
    review.rejectionReason = undefined; // Clear rejection reason if any

    await review.save();

    // Recalculate ratings for hotel, branch, and staff
    const recalculationPromises = [
      reviewService.recalculateEntityRatings(review.hotel._id, "hotel"),
      review.branch
        ? reviewService.recalculateEntityRatings(review.branch._id, "branch")
        : Promise.resolve(),
    ];

    // Also recalculate staff rating if staff was assigned to the order
    if (review.staff) {
      recalculationPromises.push(
        reviewService.recalculateEntityRatings(review.staff, "staff")
      );
    }

    await Promise.all(recalculationPromises);

    // Populate review
    await review.populate([
      { path: "user", select: "name email" },
      { path: "moderatedBy", select: "name" },
    ]);

    logger.info(`Review ${review.reviewId} approved by admin ${adminId}`);

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          { review },
          "Review approved successfully and ratings updated"
        )
      );
  } catch (error) {
    logger.error("Error approving review:", error);
    next(error);
  }
};

/**
 * Reject a review
 * PUT /api/v1/admin/reviews/:reviewId/reject
 * @access Admin
 */
export const rejectReview = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const { reviewId } = req.params;
    const { rejectionReason } = req.body;

    // Validate review ID
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return next(new APIError(400, "Invalid review ID"));
    }

    // Validate rejection reason
    const { error } = validateRejectReview({ rejectionReason });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get review
    const review = await Review.findById(reviewId).populate("hotel branch");

    if (!review) {
      return next(new APIError(404, "Review not found"));
    }

    // Check admin access
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id.toString());

      if (
        !hotelIds.includes(review.hotel._id.toString()) ||
        (review.branch &&
          !req.admin.assignedBranches.some((b) => b.equals(review.branch._id)))
      ) {
        return next(
          new APIError(403, "You do not have access to moderate this review")
        );
      }
    }

    // Check if already rejected
    if (review.status === "rejected") {
      return next(new APIError(400, "Review is already rejected"));
    }

    // Update review status
    const wasApproved = review.status === "approved";
    review.status = "rejected";
    review.moderatedBy = adminId;
    review.moderatedAt = new Date();
    review.rejectionReason = rejectionReason;

    await review.save();

    // If was previously approved, recalculate ratings for hotel, branch, and staff
    if (wasApproved) {
      const recalculationPromises = [
        reviewService.recalculateEntityRatings(review.hotel._id, "hotel"),
        review.branch
          ? reviewService.recalculateEntityRatings(review.branch._id, "branch")
          : Promise.resolve(),
      ];

      // Also recalculate staff rating if staff was assigned
      if (review.staff) {
        recalculationPromises.push(
          reviewService.recalculateEntityRatings(review.staff, "staff")
        );
      }

      await Promise.all(recalculationPromises);
    }

    // Populate review
    await review.populate([
      { path: "user", select: "name email" },
      { path: "moderatedBy", select: "name" },
    ]);

    logger.info(`Review ${review.reviewId} rejected by admin ${adminId}`);

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          { review },
          "Review rejected successfully. No notification sent to user."
        )
      );
  } catch (error) {
    logger.error("Error rejecting review:", error);
    next(error);
  }
};

/**
 * Add admin response to a review
 * POST /api/v1/admin/reviews/:reviewId/response
 * @access Admin
 */
export const addResponse = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const adminName = req.admin.name;
    const { reviewId } = req.params;
    const { message } = req.body;

    // Validate review ID
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return next(new APIError(400, "Invalid review ID"));
    }

    // Validate message
    const { error } = validateAdminResponse({ message });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get review
    const review = await Review.findById(reviewId).populate(
      "user hotel branch"
    );

    if (!review) {
      return next(new APIError(404, "Review not found"));
    }

    // Check admin access
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id.toString());

      if (
        !hotelIds.includes(review.hotel._id.toString()) ||
        (review.branch &&
          !req.admin.assignedBranches.some((b) => b.equals(review.branch._id)))
      ) {
        return next(
          new APIError(403, "You do not have access to respond to this review")
        );
      }
    }

    // Check if review is approved
    if (review.status !== "approved") {
      return next(
        new APIError(400, "Only approved reviews can have admin responses")
      );
    }

    // Add response
    const updatedReview = await reviewService.addAdminResponse(
      reviewId,
      adminId,
      message
    );

    // Send email notification to user
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Response to Your Review</h2>
          <p>Hi ${review.user.name},</p>
          <p>Thank you for your review at <strong>${
            review.hotel.name
          }</strong>${review.branch ? ` - ${review.branch.name}` : ""}.</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>Your Review:</h3>
            <p><strong>Ratings:</strong></p>
            <ul>
              <li>Food: ${review.foodRating}/5</li>
              <li>Hotel: ${review.hotelRating}/5</li>
              <li>Branch: ${review.branchRating}/5</li>
              <li>Staff: ${review.staffRating}/5</li>
            </ul>
            ${
              review.comment
                ? `<p><strong>Your Comment:</strong> ${review.comment}</p>`
                : ""
            }
          </div>

          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>Our Response:</h3>
            <p>${message}</p>
            <p style="margin-top: 10px;"><em>- ${adminName}, ${
        review.hotel.name
      }</em></p>
          </div>

          <p>We appreciate your feedback and look forward to serving you again!</p>
          
          <p>Best regards,<br>${review.hotel.name} Team</p>
        </div>
      `;

      await sendEmail({
        to: review.user.email,
        subject: `Response to Your Review at ${review.hotel.name}`,
        html: emailHtml,
      });

      logger.info(
        `Response email sent to ${review.user.email} for review ${review.reviewId}`
      );
    } catch (emailError) {
      logger.error("Error sending response email:", emailError);
      // Don't fail the request if email fails
    }

    logger.info(`Admin ${adminId} added response to review ${review.reviewId}`);

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          { review: updatedReview },
          "Response added successfully and user notified via email"
        )
      );
  } catch (error) {
    logger.error("Error adding response:", error);
    next(error);
  }
};

/**
 * Update admin response
 * PUT /api/v1/admin/reviews/:reviewId/response
 * @access Admin
 */
export const updateResponse = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const { reviewId } = req.params;
    const { message } = req.body;

    // Validate review ID
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return next(new APIError(400, "Invalid review ID"));
    }

    // Validate message
    const { error } = validateAdminResponse({ message });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get review
    const review = await Review.findById(reviewId).populate("hotel branch");

    if (!review) {
      return next(new APIError(404, "Review not found"));
    }

    // Check admin access
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id.toString());

      if (
        !hotelIds.includes(review.hotel._id.toString()) ||
        (review.branch &&
          !req.admin.assignedBranches.some((b) => b.equals(review.branch._id)))
      ) {
        return next(
          new APIError(403, "You do not have access to update this response")
        );
      }
    }

    // Update response
    const updatedReview = await reviewService.updateAdminResponse(
      reviewId,
      adminId,
      message
    );

    logger.info(
      `Admin ${adminId} updated response on review ${review.reviewId}`
    );

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          { review: updatedReview },
          "Response updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error updating response:", error);
    next(error);
  }
};

/**
 * Delete admin response
 * DELETE /api/v1/admin/reviews/:reviewId/response
 * @access Admin
 */
export const deleteResponse = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const { reviewId } = req.params;

    // Validate review ID
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return next(new APIError(400, "Invalid review ID"));
    }

    // Get review
    const review = await Review.findById(reviewId).populate("hotel branch");

    if (!review) {
      return next(new APIError(404, "Review not found"));
    }

    // Check admin access
    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id.toString());

      if (
        !hotelIds.includes(review.hotel._id.toString()) ||
        (review.branch &&
          !req.admin.assignedBranches.some((b) => b.equals(review.branch._id)))
      ) {
        return next(
          new APIError(403, "You do not have access to delete this response")
        );
      }
    }

    // Delete response
    const updatedReview = await reviewService.deleteAdminResponse(reviewId);

    logger.info(
      `Admin ${adminId} deleted response from review ${review.reviewId}`
    );

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          { review: updatedReview },
          "Response deleted successfully"
        )
      );
  } catch (error) {
    logger.error("Error deleting response:", error);
    next(error);
  }
};

/**
 * Get review analytics dashboard
 * GET /api/v1/admin/reviews/analytics
 * @access Admin
 */
export const getReviewAnalytics = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const adminRole = req.admin.role;
    const assignedBranches = req.admin.assignedBranches || [];
    const { hotelId, branchId, startDate, endDate } = req.query;

    // Build filters
    const filters = {};
    if (hotelId) filters.hotelId = hotelId;
    if (branchId) filters.branchId = branchId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Get analytics
    const analytics = await reviewAnalyticsService.getReviewStatsByAdmin(
      adminId,
      adminRole,
      assignedBranches,
      filters
    );

    logger.info(`Admin ${adminId} retrieved review analytics`);

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          { analytics },
          "Review analytics retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting review analytics:", error);
    next(error);
  }
};

export default {
  getAllReviews,
  getPendingReviews,
  approveReview,
  rejectReview,
  addResponse,
  updateResponse,
  deleteResponse,
  getReviewAnalytics,
};
