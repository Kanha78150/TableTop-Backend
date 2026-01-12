// src/services/reviewService.js - Review Service Layer
import mongoose from "mongoose";
import { Review } from "../models/Review.model.js";
import { Order } from "../models/Order.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { Staff } from "../models/Staff.model.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";

/**
 * Validate if user can submit review for an order
 * @param {string} userId - User ID
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} - { canReview: boolean, reason?: string, order?: Object }
 */
export const validateReviewEligibility = async (userId, orderId) => {
  try {
    // Check if order exists
    const order = await Order.findById(orderId).populate("hotel branch");
    if (!order) {
      return {
        canReview: false,
        reason: "Order not found",
      };
    }

    // Check if order belongs to user
    if (order.user.toString() !== userId.toString()) {
      return {
        canReview: false,
        reason: "You can only review your own orders",
      };
    }

    // Check if order is completed
    if (order.status !== "completed") {
      return {
        canReview: false,
        reason: "Order must be completed before reviewing",
      };
    }

    // Check if payment is successful
    if (order.payment?.paymentStatus !== "paid") {
      return {
        canReview: false,
        reason: "Order payment must be completed before reviewing",
      };
    }

    // Check if review already exists
    const existingReview = await Review.findOne({
      user: userId,
      order: orderId,
    });
    if (existingReview) {
      return {
        canReview: false,
        reason: "You have already submitted a review for this order",
      };
    }

    // Check if within 30-day window
    const completedAt = order.completedAt || order.updatedAt;
    const daysSinceCompletion =
      (Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCompletion > 30) {
      return {
        canReview: false,
        reason:
          "Review period has expired. You can only review orders within 30 days of completion",
      };
    }

    return {
      canReview: true,
      order,
    };
  } catch (error) {
    logger.error("Error validating review eligibility:", error);
    throw new APIError(500, "Failed to validate review eligibility");
  }
};

/**
 * Create a new review
 * @param {string} userId - User ID
 * @param {Object} reviewData - Review data
 * @returns {Promise<Object>} - Created review
 */
export const createReview = async (userId, reviewData) => {
  try {
    const {
      orderId,
      foodRating,
      hotelRating,
      branchRating,
      staffRating,
      comment,
    } = reviewData;

    // Validate eligibility
    const eligibility = await validateReviewEligibility(userId, orderId);
    if (!eligibility.canReview) {
      throw new APIError(400, eligibility.reason);
    }

    const order = eligibility.order;

    // Create review
    const review = new Review({
      user: userId,
      order: orderId,
      hotel: order.hotel._id,
      branch: order.branch?._id,
      staff: order.staff?._id, // Copy staff reference from order
      foodRating,
      hotelRating,
      branchRating,
      staffRating,
      comment: comment || "",
      status: "pending",
    });

    await review.save();

    // Update order to mark review as submitted
    await Order.findByIdAndUpdate(orderId, {
      hasReview: true,
      reviewId: review._id,
    });

    // Populate review before returning
    await review.populate([
      { path: "user", select: "name email profileImage" },
      { path: "order", select: "orderId totalPrice createdAt" },
      { path: "hotel", select: "name hotelId" },
      { path: "branch", select: "name branchId" },
      { path: "staff", select: "name staffId role" },
    ]);

    logger.info(
      `Review ${review.reviewId} created by user ${userId} for order ${orderId}`
    );

    return review;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    logger.error("Error creating review:", error);
    throw new APIError(500, "Failed to create review");
  }
};

/**
 * Update an existing review
 * @param {string} reviewId - Review ID
 * @param {string} userId - User ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<Object>} - Updated review
 */
export const updateReview = async (reviewId, userId, updates) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new APIError(404, "Review not found");
    }

    // Verify ownership
    if (review.user.toString() !== userId.toString()) {
      throw new APIError(403, "You can only update your own reviews");
    }

    // Check if review is editable (not approved)
    if (review.status === "approved") {
      throw new APIError(403, "Approved reviews cannot be edited");
    }

    // Update fields
    if (updates.foodRating !== undefined)
      review.foodRating = updates.foodRating;
    if (updates.hotelRating !== undefined)
      review.hotelRating = updates.hotelRating;
    if (updates.branchRating !== undefined)
      review.branchRating = updates.branchRating;
    if (updates.staffRating !== undefined)
      review.staffRating = updates.staffRating;
    if (updates.comment !== undefined) review.comment = updates.comment;

    // Reset status to pending if was rejected
    if (review.status === "rejected") {
      review.status = "pending";
      review.rejectionReason = undefined;
    }

    await review.save();

    // Populate before returning
    await review.populate([
      { path: "user", select: "name email profileImage" },
      { path: "order", select: "orderId totalPrice createdAt" },
      { path: "hotel", select: "name hotelId" },
      { path: "branch", select: "name branchId" },
    ]);

    logger.info(`Review ${review.reviewId} updated by user ${userId}`);

    return review;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    logger.error("Error updating review:", error);
    throw new APIError(500, "Failed to update review");
  }
};

/**
 * Toggle helpful vote on a review
 * @param {string} reviewId - Review ID
 * @param {string} userId - User ID
 * @param {boolean} isHelpful - Helpful or not
 * @returns {Promise<Object>} - Updated review
 */
export const toggleHelpfulVote = async (reviewId, userId, isHelpful) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new APIError(404, "Review not found");
    }

    // Only approved reviews can be voted on
    if (review.status !== "approved") {
      throw new APIError(400, "Only approved reviews can be voted on");
    }

    // Find existing vote
    const existingVoteIndex = review.helpfulVotes.findIndex(
      (vote) => vote.user.toString() === userId.toString()
    );

    if (existingVoteIndex !== -1) {
      // Update existing vote
      review.helpfulVotes[existingVoteIndex].helpful = isHelpful;
      review.helpfulVotes[existingVoteIndex].votedAt = new Date();
    } else {
      // Add new vote
      review.helpfulVotes.push({
        user: userId,
        helpful: isHelpful,
        votedAt: new Date(),
      });
    }

    // Recalculate helpful count
    review.updateHelpfulCount();

    await review.save();

    logger.info(
      `User ${userId} voted ${
        isHelpful ? "helpful" : "not helpful"
      } on review ${review.reviewId}`
    );

    return review;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    logger.error("Error toggling helpful vote:", error);
    throw new APIError(500, "Failed to update vote");
  }
};

/**
 * Add admin response to a review
 * @param {string} reviewId - Review ID
 * @param {string} adminId - Admin ID
 * @param {string} message - Response message
 * @returns {Promise<Object>} - Updated review
 */
export const addAdminResponse = async (reviewId, adminId, message) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new APIError(404, "Review not found");
    }

    // Only approved reviews can have responses
    if (review.status !== "approved") {
      throw new APIError(400, "Only approved reviews can have admin responses");
    }

    // Add or update response
    review.response = {
      message,
      respondedBy: adminId,
      respondedAt: new Date(),
    };

    await review.save();

    // Populate before returning
    await review.populate([
      { path: "user", select: "name email" },
      { path: "response.respondedBy", select: "name role" },
    ]);

    logger.info(`Admin ${adminId} responded to review ${review.reviewId}`);

    return review;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    logger.error("Error adding admin response:", error);
    throw new APIError(500, "Failed to add response");
  }
};

/**
 * Update admin response
 * @param {string} reviewId - Review ID
 * @param {string} adminId - Admin ID
 * @param {string} message - Updated message
 * @returns {Promise<Object>} - Updated review
 */
export const updateAdminResponse = async (reviewId, adminId, message) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new APIError(404, "Review not found");
    }

    if (!review.response || !review.response.message) {
      throw new APIError(404, "No response exists for this review");
    }

    review.response.message = message;
    review.response.respondedAt = new Date();

    await review.save();

    await review.populate([
      { path: "response.respondedBy", select: "name role" },
    ]);

    logger.info(
      `Admin ${adminId} updated response on review ${review.reviewId}`
    );

    return review;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    logger.error("Error updating admin response:", error);
    throw new APIError(500, "Failed to update response");
  }
};

/**
 * Delete admin response
 * @param {string} reviewId - Review ID
 * @returns {Promise<Object>} - Updated review
 */
export const deleteAdminResponse = async (reviewId) => {
  try {
    const review = await Review.findById(reviewId);

    if (!review) {
      throw new APIError(404, "Review not found");
    }

    if (!review.response || !review.response.message) {
      throw new APIError(404, "No response exists for this review");
    }

    review.response = undefined;
    await review.save();

    logger.info(`Admin response deleted from review ${review.reviewId}`);

    return review;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    logger.error("Error deleting admin response:", error);
    throw new APIError(500, "Failed to delete response");
  }
};

/**
 * Recalculate and update aggregated ratings for hotel or branch
 * @param {string} entityId - Hotel or Branch ID
 * @param {string} entityType - 'hotel' or 'branch'
 * @returns {Promise<void>}
 */
export const recalculateEntityRatings = async (entityId, entityType) => {
  try {
    // Handle staff entity type separately
    if (entityType === "staff") {
      // Aggregate approved reviews for this staff member
      const stats = await Review.aggregate([
        {
          $match: {
            staff: new mongoose.Types.ObjectId(entityId),
            status: "approved",
          },
        },
        {
          $group: {
            _id: null,
            totalReviews: { $sum: 1 },
            avgStaffRating: { $avg: "$staffRating" },
          },
        },
        {
          $project: {
            totalReviews: 1,
            avgStaffRating: { $round: ["$avgStaffRating", 2] },
          },
        },
      ]);

      if (stats.length > 0) {
        const { totalReviews, avgStaffRating } = stats[0];

        // Update staff assignmentStats
        await Staff.findByIdAndUpdate(entityId, {
          "assignmentStats.customerRating": avgStaffRating || 0,
          "assignmentStats.totalReviews": totalReviews || 0,
          "assignmentStats.lastStatsUpdate": new Date(),
        });

        logger.info(
          `Updated staff ${entityId} ratings: ${avgStaffRating} (${totalReviews} reviews)`
        );
      } else {
        // No reviews, reset to 0
        await Staff.findByIdAndUpdate(entityId, {
          "assignmentStats.customerRating": 0,
          "assignmentStats.totalReviews": 0,
          "assignmentStats.lastStatsUpdate": new Date(),
        });

        logger.info(`Reset staff ${entityId} ratings (no approved reviews)`);
      }
      return;
    }

    // Handle hotel and branch entity types
    const matchField = entityType === "hotel" ? "hotel" : "branch";

    // Aggregate approved reviews to calculate averages
    const stats = await Review.aggregate([
      {
        $match: {
          [matchField]: new mongoose.Types.ObjectId(entityId),
          status: "approved",
        },
      },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgFoodRating: { $avg: "$foodRating" },
          avgHotelRating: { $avg: "$hotelRating" },
          avgBranchRating: { $avg: "$branchRating" },
          avgStaffRating: { $avg: "$staffRating" },
        },
      },
      {
        $project: {
          totalReviews: 1,
          avgFoodRating: { $round: ["$avgFoodRating", 2] },
          avgHotelRating: { $round: ["$avgHotelRating", 2] },
          avgBranchRating: { $round: ["$avgBranchRating", 2] },
          avgStaffRating: { $round: ["$avgStaffRating", 2] },
          overallAverage: {
            $round: [
              {
                $avg: [
                  "$avgFoodRating",
                  "$avgHotelRating",
                  "$avgBranchRating",
                  "$avgStaffRating",
                ],
              },
              2,
            ],
          },
        },
      },
    ]);

    if (stats.length > 0) {
      const { totalReviews, overallAverage } = stats[0];

      // Update the entity
      const Model = entityType === "hotel" ? Hotel : Branch;
      await Model.findByIdAndUpdate(entityId, {
        "rating.average": overallAverage || 0,
        "rating.totalReviews": totalReviews || 0,
      });

      logger.info(
        `Updated ${entityType} ${entityId} ratings: ${overallAverage} (${totalReviews} reviews)`
      );
    } else {
      // No reviews, reset to 0
      const Model = entityType === "hotel" ? Hotel : Branch;
      await Model.findByIdAndUpdate(entityId, {
        "rating.average": 0,
        "rating.totalReviews": 0,
      });

      logger.info(
        `Reset ${entityType} ${entityId} ratings (no approved reviews)`
      );
    }
  } catch (error) {
    logger.error(`Error recalculating ${entityType} ratings:`, error);
    throw new APIError(500, `Failed to recalculate ${entityType} ratings`);
  }
};

export default {
  validateReviewEligibility,
  createReview,
  updateReview,
  toggleHelpfulVote,
  addAdminResponse,
  updateAdminResponse,
  deleteAdminResponse,
  recalculateEntityRatings,
};
