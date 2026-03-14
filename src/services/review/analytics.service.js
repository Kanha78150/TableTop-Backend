// src/services/reviewAnalyticsService.js - Review Analytics Service
import mongoose from "mongoose";
import { Review } from "../../models/Review.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";

/**
 * Get comprehensive review statistics for admin
 * @param {string} adminId - Admin ID
 * @param {string} adminRole - Admin role
 * @param {Array} assignedBranches - Assigned branches for branch admin
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} - Analytics data
 */
export const getReviewStatsByAdmin = async (
  adminId,
  adminRole,
  assignedBranches,
  filters = {}
) => {
  try {
    // Build base match query based on admin access
    let baseMatch = {};

    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id);

      baseMatch = {
        hotel: { $in: hotelIds },
        branch: { $in: assignedBranches },
      };
    }

    // Apply additional filters
    if (filters.hotelId) {
      baseMatch.hotel = new mongoose.Types.ObjectId(filters.hotelId);
    }

    if (filters.branchId) {
      baseMatch.branch = new mongoose.Types.ObjectId(filters.branchId);
    }

    if (filters.startDate || filters.endDate) {
      baseMatch.createdAt = {};
      if (filters.startDate) {
        baseMatch.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        // Add one day to include the entire end date
        const endDateTime = new Date(filters.endDate);
        endDateTime.setHours(23, 59, 59, 999);
        baseMatch.createdAt.$lte = endDateTime;
      }
    }

    // Overview metrics
    const overviewStats = await Review.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          statusBreakdown: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ],
          moderationTime: [
            {
              $match: {
                status: { $in: ["approved", "rejected"] },
                moderatedAt: { $exists: true },
              },
            },
            {
              $project: {
                moderationTimeHours: {
                  $divide: [
                    { $subtract: ["$moderatedAt", "$createdAt"] },
                    1000 * 60 * 60, // Convert to hours
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgModerationTime: { $avg: "$moderationTimeHours" },
              },
            },
          ],
        },
      },
    ]);

    const statusCounts = overviewStats[0].statusBreakdown.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {}
    );

    const totalReviews =
      (statusCounts.pending || 0) +
      (statusCounts.approved || 0) +
      (statusCounts.rejected || 0);
    const approvalRate =
      totalReviews > 0
        ? parseFloat(
            ((statusCounts.approved || 0) / totalReviews) * 100
          ).toFixed(2)
        : 0;

    const avgModerationTime =
      overviewStats[0].moderationTime[0]?.avgModerationTime || 0;

    // Rating analytics
    const ratingStats = await Review.aggregate([
      { $match: { ...baseMatch, status: "approved" } },
      {
        $group: {
          _id: null,
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
          avgFoodRating: { $round: ["$avgFoodRating", 2] },
          avgHotelRating: { $round: ["$avgHotelRating", 2] },
          avgBranchRating: { $round: ["$avgBranchRating", 2] },
          avgStaffRating: { $round: ["$avgStaffRating", 2] },
          avgOverallRating: { $round: ["$avgOverallRating", 2] },
        },
      },
    ]);

    // Rating distribution
    const distributionStats = await Review.aggregate([
      { $match: { ...baseMatch, status: "approved" } },
      {
        $project: {
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
        },
      },
      {
        $bucket: {
          groupBy: "$overallRating",
          boundaries: [1, 2, 3, 4, 5, 6],
          default: "other",
          output: {
            count: { $sum: 1 },
          },
        },
      },
    ]);

    const distribution = {
      stars5: 0,
      stars4: 0,
      stars3: 0,
      stars2: 0,
      stars1: 0,
    };

    distributionStats.forEach((bucket) => {
      const rating = Math.floor(bucket._id);
      if (rating >= 1 && rating <= 5) {
        distribution[`stars${rating}`] = bucket.count;
      }
    });

    // Engagement metrics
    const engagementStats = await Review.aggregate([
      { $match: { ...baseMatch, status: "approved" } },
      {
        $group: {
          _id: null,
          totalHelpfulVotes: { $sum: "$helpfulCount" },
          avgHelpfulVotes: { $avg: "$helpfulCount" },
          reviewsWithResponse: {
            $sum: {
              $cond: [{ $ifNull: ["$response.message", false] }, 1, 0],
            },
          },
          totalReviews: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          totalHelpfulVotes: 1,
          avgHelpfulVotes: { $round: ["$avgHelpfulVotes", 2] },
          responseRate: {
            $round: [
              {
                $multiply: [
                  { $divide: ["$reviewsWithResponse", "$totalReviews"] },
                  100,
                ],
              },
              2,
            ],
          },
        },
      },
    ]);

    // Breakdown by hotel
    const hotelBreakdown = await Review.aggregate([
      { $match: { ...baseMatch, status: "approved" } },
      {
        $group: {
          _id: "$hotel",
          totalReviews: { $sum: 1 },
          avgRating: {
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
        $lookup: {
          from: "hotels",
          localField: "_id",
          foreignField: "_id",
          as: "hotelInfo",
        },
      },
      {
        $addFields: {
          hotelInfo: { $arrayElemAt: ["$hotelInfo", 0] },
        },
      },
      {
        $project: {
          _id: 0,
          hotelId: "$_id",
          name: "$hotelInfo.name",
          hotelIdStr: "$hotelInfo.hotelId",
          totalReviews: 1,
          avgRating: { $round: ["$avgRating", 2] },
        },
      },
      { $sort: { avgRating: -1 } },
      { $limit: 10 },
    ]);

    // Breakdown by branch
    const branchBreakdown = await Review.aggregate([
      {
        $match: { ...baseMatch, status: "approved", branch: { $exists: true } },
      },
      {
        $group: {
          _id: "$branch",
          totalReviews: { $sum: 1 },
          avgRating: {
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
        $lookup: {
          from: "branches",
          localField: "_id",
          foreignField: "_id",
          as: "branchInfo",
        },
      },
      {
        $addFields: {
          branchInfo: { $arrayElemAt: ["$branchInfo", 0] },
        },
      },
      {
        $project: {
          _id: 0,
          branchId: "$_id",
          name: "$branchInfo.name",
          branchIdStr: "$branchInfo.branchId",
          totalReviews: 1,
          avgRating: { $round: ["$avgRating", 2] },
        },
      },
      { $sort: { avgRating: -1 } },
      { $limit: 10 },
    ]);

    // Monthly trends (last 6 months or custom date range)
    let trendsMatch = { ...baseMatch };

    // If no date filter provided, default to last 6 months
    if (!baseMatch.createdAt) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      trendsMatch.createdAt = { $gte: sixMonthsAgo };
    }

    const monthlyTrends = await Review.aggregate([
      {
        $match: trendsMatch,
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
          avgRating: {
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
          approved: {
            $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          month: {
            $dateToString: {
              format: "%Y-%m",
              date: {
                $dateFromParts: {
                  year: "$_id.year",
                  month: "$_id.month",
                },
              },
            },
          },
          count: 1,
          avgRating: { $round: ["$avgRating", 2] },
          approved: 1,
          pending: 1,
          rejected: 1,
        },
      },
      { $sort: { month: 1 } },
    ]);

    return {
      overview: {
        totalReviews,
        pendingCount: statusCounts.pending || 0,
        approvedCount: statusCounts.approved || 0,
        rejectedCount: statusCounts.rejected || 0,
        approvalRate: parseFloat(approvalRate),
        avgModerationTime: parseFloat(avgModerationTime.toFixed(2)),
      },
      ratings: ratingStats[0] || {
        avgFoodRating: 0,
        avgHotelRating: 0,
        avgBranchRating: 0,
        avgStaffRating: 0,
        avgOverallRating: 0,
      },
      distribution,
      engagement: engagementStats[0] || {
        totalHelpfulVotes: 0,
        avgHelpfulVotes: 0,
        responseRate: 0,
      },
      breakdown: {
        byHotel: hotelBreakdown,
        byBranch: branchBreakdown,
      },
      trends: {
        monthly: monthlyTrends,
      },
    };
  } catch (error) {
    logger.error("Error getting review analytics:", error);
    throw new APIError(500, "Failed to generate review analytics");
  }
};

/**
 * Get monthly review trends
 * @param {string} adminId - Admin ID
 * @param {string} adminRole - Admin role
 * @param {Array} assignedBranches - Assigned branches
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} - Monthly trends
 */
export const getMonthlyTrends = async (
  adminId,
  adminRole,
  assignedBranches,
  startDate,
  endDate
) => {
  try {
    // Build base match
    let baseMatch = {};

    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id);

      baseMatch = {
        hotel: { $in: hotelIds },
        branch: { $in: assignedBranches },
      };
    }

    baseMatch.createdAt = { $gte: startDate, $lte: endDate };

    const trends = await Review.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
          avgRating: {
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
          month: {
            $dateToString: {
              format: "%Y-%m",
              date: {
                $dateFromParts: {
                  year: "$_id.year",
                  month: "$_id.month",
                },
              },
            },
          },
          count: 1,
          avgRating: { $round: ["$avgRating", 2] },
        },
      },
      { $sort: { month: 1 } },
    ]);

    return trends;
  } catch (error) {
    logger.error("Error getting monthly trends:", error);
    throw new APIError(500, "Failed to get monthly trends");
  }
};

/**
 * Get top and bottom rated reviews
 * @param {string} adminId - Admin ID
 * @param {string} adminRole - Admin role
 * @param {Array} assignedBranches - Assigned branches
 * @param {number} limit - Number of reviews to return
 * @returns {Promise<Object>} - Top and bottom reviews
 */
export const getTopReviews = async (
  adminId,
  adminRole,
  assignedBranches,
  limit = 5
) => {
  try {
    // Build base match
    let baseMatch = { status: "approved" };

    if (adminRole === "branch_admin") {
      const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
      const hotelIds = hotels.map((h) => h._id);

      baseMatch.hotel = { $in: hotelIds };
      baseMatch.branch = { $in: assignedBranches };
    }

    // Get top rated reviews
    const topReviews = await Review.aggregate([
      { $match: baseMatch },
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
        },
      },
      { $sort: { overallRating: -1, createdAt: -1 } },
      { $limit: limit },
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
          from: "hotels",
          localField: "hotel",
          foreignField: "_id",
          as: "hotelInfo",
        },
      },
      {
        $addFields: {
          user: { $arrayElemAt: ["$userInfo", 0] },
          hotel: { $arrayElemAt: ["$hotelInfo", 0] },
        },
      },
      {
        $project: {
          reviewId: 1,
          "user.name": 1,
          "hotel.name": 1,
          overallRating: { $round: ["$overallRating", 2] },
          comment: 1,
          helpfulCount: 1,
          createdAt: 1,
        },
      },
    ]);

    // Get lowest rated reviews
    const lowestReviews = await Review.aggregate([
      { $match: baseMatch },
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
        },
      },
      { $sort: { overallRating: 1, createdAt: -1 } },
      { $limit: limit },
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
          from: "hotels",
          localField: "hotel",
          foreignField: "_id",
          as: "hotelInfo",
        },
      },
      {
        $addFields: {
          user: { $arrayElemAt: ["$userInfo", 0] },
          hotel: { $arrayElemAt: ["$hotelInfo", 0] },
        },
      },
      {
        $project: {
          reviewId: 1,
          "user.name": 1,
          "hotel.name": 1,
          overallRating: { $round: ["$overallRating", 2] },
          comment: 1,
          createdAt: 1,
        },
      },
    ]);

    return {
      topRated: topReviews,
      lowestRated: lowestReviews,
    };
  } catch (error) {
    logger.error("Error getting top reviews:", error);
    throw new APIError(500, "Failed to get top reviews");
  }
};

export default {
  getReviewStatsByAdmin,
  getMonthlyTrends,
  getTopReviews,
};
