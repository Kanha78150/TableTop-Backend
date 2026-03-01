// src/routes/user/review.route.js - User Review Routes (mixed public/protected)
import express from "express";
import { authenticateUser } from "../../middleware/auth.middleware.js";
import {
  submitReview,
  getMyReviews,
  updateReview,
  markReviewHelpful,
  getHotelReviews,
  getBranchReviews,
  getReviewDetails,
  getReviewByOrderId,
} from "../../controllers/user/review.controller.js";

const router = express.Router();

// Public review routes (no authentication required)
router.get("/hotel/:hotelId", getHotelReviews);
router.get("/branch/:branchId", getBranchReviews);
router.get("/order/:orderId", getReviewByOrderId);

// Protected review routes (authentication required)
router.post("/", authenticateUser, submitReview);
router.get("/my-reviews", authenticateUser, getMyReviews);
router.put("/:reviewId", authenticateUser, updateReview);
router.post("/:reviewId/helpful", authenticateUser, markReviewHelpful);

// Public - must come last to avoid matching specific routes
router.get("/:reviewId", getReviewDetails);

export default router;
