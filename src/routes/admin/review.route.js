// src/routes/admin/review.route.js - Admin Review Moderation Routes
import express from "express";
import {
  getAllReviews,
  getPendingReviews,
  approveReview,
  rejectReview,
  addResponse,
  updateResponse,
  deleteResponse,
  getReviewAnalytics,
} from "../../controllers/admin/reviewModeration.controller.js";
import {
  authenticateAdmin,
  requireAdmin,
  rbac,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Apply authentication and admin role requirement to all routes
router.use(authenticateAdmin);
router.use(requireAdmin);

/**
 * @route   GET /api/v1/admin/reviews
 * @desc    Get all reviews (with branch isolation for branch admins)
 * @access  Admin (handleComplaints permission required)
 */
router.get("/", rbac("handleComplaints"), getAllReviews);

/**
 * @route   GET /api/v1/admin/reviews/pending
 * @desc    Get all pending reviews for moderation
 * @access  Admin (handleComplaints permission required)
 */
router.get("/pending", rbac("handleComplaints"), getPendingReviews);

/**
 * @route   GET /api/v1/admin/reviews/analytics
 * @desc    Get comprehensive review analytics and statistics
 * @access  Admin (handleComplaints permission required)
 */
router.get("/analytics", rbac("handleComplaints"), getReviewAnalytics);

/**
 * @route   PUT /api/v1/admin/reviews/:reviewId/approve
 * @desc    Approve a pending review
 * @access  Admin (handleComplaints permission required)
 */
router.put("/:reviewId/approve", rbac("handleComplaints"), approveReview);

/**
 * @route   PUT /api/v1/admin/reviews/:reviewId/reject
 * @desc    Reject a pending review (requires rejection reason)
 * @access  Admin (handleComplaints permission required)
 */
router.put("/:reviewId/reject", rbac("handleComplaints"), rejectReview);

/**
 * @route   POST /api/v1/admin/reviews/:reviewId/response
 * @desc    Add admin response to an approved review (sends email notification)
 * @access  Admin (handleComplaints permission required)
 */
router.post("/:reviewId/response", rbac("handleComplaints"), addResponse);

/**
 * @route   PUT /api/v1/admin/reviews/:reviewId/response
 * @desc    Update existing admin response
 * @access  Admin (handleComplaints permission required)
 */
router.put("/:reviewId/response", rbac("handleComplaints"), updateResponse);

/**
 * @route   DELETE /api/v1/admin/reviews/:reviewId/response
 * @desc    Delete admin response from a review
 * @access  Admin (handleComplaints permission required)
 */
router.delete("/:reviewId/response", rbac("handleComplaints"), deleteResponse);

export default router;
