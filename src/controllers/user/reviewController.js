// src/controllers/user/reviewController.js - User Review Controller
import mongoose from "mongoose";
import {
  Review,
  validateCreateReview,
  validateUpdateReview,
  validateHelpfulVote,
} from "../../models/Review.model.js";
import reviewService from "../../services/reviewService.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";

/**
 * Submit a new review
 * POST /api/v1/user/reviews
 * @access Private (User)
 */
export const submitReview = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      orderId,
      foodRating,
      hotelRating,
      branchRating,
      staffRating,
      comment,
    } = req.body;

    // Validate input
    const { error } = validateCreateReview(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Create review
    const review = await reviewService.createReview(userId, {
      orderId,
      foodRating,
      hotelRating,
      branchRating,
      staffRating,
      comment,
    });

    return res
      .status(201)
      .json(
        new APIResponse(
          201,
          { review },
          "Review submitted successfully and is pending admin approval"
        )
      );
  } catch (error) {
    logger.error("Error submitting review:", error);
    next(error);
  }
};

/**
 * Get user's own reviews
 * GET /api/v1/user/reviews/my-reviews
 * @access Private (User)
 */
export const getMyReviews = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 20,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build query
    const query = { user: userId };
    if (status && status !== "all") {
      query.status = status;
    }

    // Pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Get reviews
    const [reviews, totalReviews] = await Promise.all([
      Review.find(query)
        .populate("order", "orderId totalPrice createdAt completedAt")
        .populate("hotel", "name hotelId")
        .populate("branch", "name branchId")
        .populate("moderatedBy", "name")
        .populate("response.respondedBy", "name")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Review.countDocuments(query),
    ]);

    // Get status breakdown
    const statusCounts = await Review.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const statusBreakdown = statusCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    return res.status(200).json(
      new APIResponse(
        200,
        {
          reviews,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews,
            hasNextPage: page < Math.ceil(totalReviews / limit),
            hasPrevPage: page > 1,
          },
          statusBreakdown,
        },
        "Reviews retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting user reviews:", error);
    next(error);
  }
};

/**
 * Update a review
 * PUT /api/v1/user/reviews/:reviewId
 * @access Private (User)
 */
export const updateReview = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { reviewId } = req.params;
    const updates = req.body;

    // Validate review ID
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return next(new APIError(400, "Invalid review ID"));
    }

    // Validate input
    const { error } = validateUpdateReview(updates);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Update review
    const review = await reviewService.updateReview(reviewId, userId, updates);

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          { review },
          "Review updated successfully and reset to pending status for re-approval"
        )
      );
  } catch (error) {
    logger.error("Error updating review:", error);
    next(error);
  }
};

/**
 * Check if user can review an order
 * GET /api/v1/user/reviews/eligibility/:orderId
 * @access Private (User)
 */
// export const checkEligibility = async (req, res, next) => {
//   try {
//     const userId = req.user._id;
//     const { orderId } = req.params;

//     // Validate order ID
//     if (!mongoose.Types.ObjectId.isValid(orderId)) {
//       return next(new APIError(400, "Invalid order ID"));
//     }

//     // Check eligibility
//     const eligibility = await reviewService.validateReviewEligibility(
//       userId,
//       orderId
//     );

//     return res.status(200).json(
//       new APIResponse(
//         200,
//         {
//           canReview: eligibility.canReview,
//           reason: eligibility.reason,
//           orderId,
//         },
//         eligibility.canReview
//           ? "You can submit a review for this order"
//           : "Review not allowed"
//       )
//     );
//   } catch (error) {
//     logger.error("Error checking review eligibility:", error);
//     next(error);
//   }
// };

/**
 * Mark review as helpful or not helpful
 * POST /api/v1/user/reviews/:reviewId/helpful
 * @access Private (User)
 */
export const markReviewHelpful = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { reviewId } = req.params;
    const { helpful } = req.body;

    // Validate review ID
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return next(new APIError(400, "Invalid review ID"));
    }

    // Validate input
    const { error } = validateHelpfulVote({ helpful });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Toggle vote
    const review = await reviewService.toggleHelpfulVote(
      reviewId,
      userId,
      helpful
    );

    return res.status(200).json(
      new APIResponse(
        200,
        {
          reviewId: review.reviewId,
          helpfulCount: review.helpfulCount,
          userVote: helpful,
        },
        "Vote recorded successfully"
      )
    );
  } catch (error) {
    logger.error("Error marking review helpful:", error);
    next(error);
  }
};

/**
 * Get reviews for a specific hotel (Public)
 * GET /api/v1/user/reviews/hotel/:hotelId
 * @access Public
 */
export const getHotelReviews = async (req, res, next) => {
  try {
    const { hotelId } = req.params;
    const {
      page = 1,
      limit = 20,
      minRating,
      maxRating,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Validate hotel ID
    if (!mongoose.Types.ObjectId.isValid(hotelId)) {
      return next(new APIError(400, "Invalid hotel ID"));
    }

    // Build match query
    const matchQuery = {
      hotel: new mongoose.Types.ObjectId(hotelId),
      status: "approved",
    };

    // Build aggregation pipeline
    const pipeline = [{ $match: matchQuery }];

    // Add rating filters if provided
    if (minRating || maxRating) {
      const ratingMatch = {};
      const overallRatingExpr = {
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

      if (minRating)
        ratingMatch.$gte = [overallRatingExpr, parseFloat(minRating)];
      if (maxRating)
        ratingMatch.$lte = [overallRatingExpr, parseFloat(maxRating)];

      if (Object.keys(ratingMatch).length > 0) {
        pipeline.push({
          $match: { $expr: { $and: Object.values(ratingMatch) } },
        });
      }
    }

    // Use facet for parallel processing
    const skip = (page - 1) * limit;
    const sortOptions = {};
    if (sortBy === "helpfulCount") {
      sortOptions.helpfulCount = sortOrder === "desc" ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

    pipeline.push({
      $facet: {
        reviews: [
          { $sort: sortOptions },
          { $skip: skip },
          { $limit: parseInt(limit) },
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "userInfo",
            },
          },
          {
            $lookup: {
              from: "admins",
              localField: "response.respondedBy",
              foreignField: "_id",
              as: "responseAdmin",
            },
          },
          {
            $addFields: {
              overallRating: {
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
              },
              user: { $arrayElemAt: ["$userInfo", 0] },
              "response.respondedBy": { $arrayElemAt: ["$responseAdmin", 0] },
            },
          },
          {
            $project: {
              reviewId: 1,
              "user.name": 1,
              "user.profileImage": 1,
              foodRating: 1,
              hotelRating: 1,
              branchRating: 1,
              staffRating: 1,
              overallRating: 1,
              comment: 1,
              helpfulCount: 1,
              response: 1,
              createdAt: 1,
            },
          },
        ],
        statistics: [
          {
            $group: {
              _id: null,
              totalReviews: { $sum: 1 },
              avgFoodRating: { $avg: "$foodRating" },
              avgHotelRating: { $avg: "$hotelRating" },
              avgBranchRating: { $avg: "$branchRating" },
              avgStaffRating: { $avg: "$staffRating" },
              avgOverallRating: {
                $avg: {
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
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              totalReviews: 1,
              avgFoodRating: { $round: ["$avgFoodRating", 2] },
              avgHotelRating: { $round: ["$avgHotelRating", 2] },
              avgBranchRating: { $round: ["$avgBranchRating", 2] },
              avgStaffRating: { $round: ["$avgStaffRating", 2] },
              avgOverallRating: { $round: ["$avgOverallRating", 2] },
            },
          },
        ],
        distribution: [
          {
            $bucket: {
              groupBy: {
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
              },
              boundaries: [1, 2, 3, 4, 5, 6],
              default: "other",
              output: {
                count: { $sum: 1 },
              },
            },
          },
        ],
        mostHelpful: [
          { $sort: { helpfulCount: -1, createdAt: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "userInfo",
            },
          },
          {
            $addFields: {
              overallRating: {
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
              },
              user: { $arrayElemAt: ["$userInfo", 0] },
            },
          },
          {
            $project: {
              reviewId: 1,
              "user.name": 1,
              overallRating: 1,
              comment: { $substr: ["$comment", 0, 100] },
              helpfulCount: 1,
              createdAt: 1,
            },
          },
        ],
      },
    });

    const [result] = await Review.aggregate(pipeline);

    const { reviews, statistics, distribution, mostHelpful } = result;

    // Format rating distribution
    const ratingDistribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    distribution.forEach((bucket) => {
      const rating = Math.floor(bucket._id);
      if (rating >= 1 && rating <= 5) {
        ratingDistribution[rating] = bucket.count;
      }
    });

    return res.status(200).json(
      new APIResponse(
        200,
        {
          reviews,
          statistics: statistics[0] || {
            totalReviews: 0,
            avgFoodRating: 0,
            avgHotelRating: 0,
            avgBranchRating: 0,
            avgStaffRating: 0,
            avgOverallRating: 0,
          },
          ratingDistribution,
          mostHelpful,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil((statistics[0]?.totalReviews || 0) / limit),
            totalReviews: statistics[0]?.totalReviews || 0,
            hasNextPage:
              page < Math.ceil((statistics[0]?.totalReviews || 0) / limit),
            hasPrevPage: page > 1,
          },
        },
        "Hotel reviews retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting hotel reviews:", error);
    next(error);
  }
};

/**
 * Get reviews for a specific branch (Public)
 * GET /api/v1/user/reviews/branch/:branchId
 * @access Public
 */
export const getBranchReviews = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const {
      page = 1,
      limit = 20,
      minRating,
      maxRating,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Validate branch ID
    if (!mongoose.Types.ObjectId.isValid(branchId)) {
      return next(new APIError(400, "Invalid branch ID"));
    }

    // Build match query
    const matchQuery = {
      branch: new mongoose.Types.ObjectId(branchId),
      status: "approved",
    };

    // Use same aggregation pipeline as hotel reviews
    const pipeline = [{ $match: matchQuery }];

    // Add rating filters
    if (minRating || maxRating) {
      const ratingMatch = {};
      const overallRatingExpr = {
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

      if (minRating)
        ratingMatch.$gte = [overallRatingExpr, parseFloat(minRating)];
      if (maxRating)
        ratingMatch.$lte = [overallRatingExpr, parseFloat(maxRating)];

      if (Object.keys(ratingMatch).length > 0) {
        pipeline.push({
          $match: { $expr: { $and: Object.values(ratingMatch) } },
        });
      }
    }

    const skip = (page - 1) * limit;
    const sortOptions = {};
    if (sortBy === "helpfulCount") {
      sortOptions.helpfulCount = sortOrder === "desc" ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    }

    pipeline.push({
      $facet: {
        reviews: [
          { $sort: sortOptions },
          { $skip: skip },
          { $limit: parseInt(limit) },
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "userInfo",
            },
          },
          {
            $lookup: {
              from: "admins",
              localField: "response.respondedBy",
              foreignField: "_id",
              as: "responseAdmin",
            },
          },
          {
            $addFields: {
              overallRating: {
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
              },
              user: { $arrayElemAt: ["$userInfo", 0] },
              "response.respondedBy": { $arrayElemAt: ["$responseAdmin", 0] },
            },
          },
          {
            $project: {
              reviewId: 1,
              "user.name": 1,
              "user.profileImage": 1,
              foodRating: 1,
              hotelRating: 1,
              branchRating: 1,
              staffRating: 1,
              overallRating: 1,
              comment: 1,
              helpfulCount: 1,
              response: 1,
              createdAt: 1,
            },
          },
        ],
        statistics: [
          {
            $group: {
              _id: null,
              totalReviews: { $sum: 1 },
              avgFoodRating: { $avg: "$foodRating" },
              avgHotelRating: { $avg: "$hotelRating" },
              avgBranchRating: { $avg: "$branchRating" },
              avgStaffRating: { $avg: "$staffRating" },
              avgOverallRating: {
                $avg: {
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
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              totalReviews: 1,
              avgFoodRating: { $round: ["$avgFoodRating", 2] },
              avgHotelRating: { $round: ["$avgHotelRating", 2] },
              avgBranchRating: { $round: ["$avgBranchRating", 2] },
              avgStaffRating: { $round: ["$avgStaffRating", 2] },
              avgOverallRating: { $round: ["$avgOverallRating", 2] },
            },
          },
        ],
        distribution: [
          {
            $bucket: {
              groupBy: {
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
              },
              boundaries: [1, 2, 3, 4, 5, 6],
              default: "other",
              output: {
                count: { $sum: 1 },
              },
            },
          },
        ],
      },
    });

    const [result] = await Review.aggregate(pipeline);
    const { reviews, statistics, distribution } = result;

    // Format rating distribution
    const ratingDistribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    distribution.forEach((bucket) => {
      const rating = Math.floor(bucket._id);
      if (rating >= 1 && rating <= 5) {
        ratingDistribution[rating] = bucket.count;
      }
    });

    return res.status(200).json(
      new APIResponse(
        200,
        {
          reviews,
          statistics: statistics[0] || {
            totalReviews: 0,
            avgFoodRating: 0,
            avgHotelRating: 0,
            avgBranchRating: 0,
            avgStaffRating: 0,
            avgOverallRating: 0,
          },
          ratingDistribution,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil((statistics[0]?.totalReviews || 0) / limit),
            totalReviews: statistics[0]?.totalReviews || 0,
            hasNextPage:
              page < Math.ceil((statistics[0]?.totalReviews || 0) / limit),
            hasPrevPage: page > 1,
          },
        },
        "Branch reviews retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting branch reviews:", error);
    next(error);
  }
};

/**
 * Get single review details (Public)
 * GET /api/v1/user/reviews/:reviewId
 * @access Public
 */
export const getReviewDetails = async (req, res, next) => {
  try {
    const { reviewId } = req.params;

    // Validate review ID
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return next(new APIError(400, "Invalid review ID"));
    }

    const review = await Review.findById(reviewId)
      .populate("user", "name profileImage")
      .populate("order", "orderId items totalPrice createdAt")
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId")
      .populate("response.respondedBy", "name role")
      .lean();

    if (!review) {
      return next(new APIError(404, "Review not found"));
    }

    // Calculate overall rating
    review.overallRating = parseFloat(
      (
        (review.foodRating +
          review.hotelRating +
          review.branchRating +
          review.staffRating) /
        4
      ).toFixed(2)
    );

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          { review },
          "Review details retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting review details:", error);
    next(error);
  }
};

/**
 * Get review by order ID
 * GET /api/v1/user/reviews/order/:orderId
 * @access Public (with optional authentication)
 */
export const getReviewByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    // Validate order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    // Find review by order ID
    const review = await Review.findOne({ order: orderId })
      .populate("user", "name email profileImage")
      .populate("hotel", "name hotelId")
      .populate("branch", "name branchId")
      .populate("staff", "name staffId role")
      .populate("moderatedBy", "name");

    if (!review) {
      return next(new APIError(404, "No review found for this order"));
    }

    // Show review regardless of status (no approval check)
    return res
      .status(200)
      .json(new APIResponse(200, { review }, "Review retrieved successfully"));
  } catch (error) {
    logger.error("Error getting review by order ID:", error);
    next(error);
  }
};

export default {
  submitReview,
  getMyReviews,
  updateReview,
  // checkEligibility,
  markReviewHelpful,
  getHotelReviews,
  getBranchReviews,
  getReviewDetails,
  getReviewByOrderId,
};
