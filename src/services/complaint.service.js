/**
 * Complaint Service – shared logic used by admin, manager, staff & user controllers.
 *
 * Each function covers the *database* layer only (no HTTP req/res).
 * Controllers remain responsible for access-checks, socket events, and HTTP responses.
 */

import { Complaint } from "../models/Complaint.model.js";
import { CoinTransaction } from "../models/CoinTransaction.model.js";
import { logger } from "../utils/logger.js";

// ─── Coin compensation map (shared between admin & manager resolve) ───
const COIN_COMPENSATION = {
  low: 50,
  medium: 100,
  high: 200,
  urgent: 500,
};

// ─────────────────────────────────────────────────────────────────────────
// 1. Resolve complaint with coin compensation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Core resolve-complaint logic shared by admin & manager controllers.
 *
 * @param {Object} opts
 * @param {import("mongoose").Document} opts.complaint – Mongoose document (should be populated with "user")
 * @param {string} opts.resolution – Resolution text (already validated ≥ 10 chars by caller)
 * @param {string} opts.resolverId – ObjectId of the resolver (admin / manager)
 * @param {string} opts.resolverModel – "Admin" | "Manager"
 * @param {string} [opts.internalNotes]
 * @param {boolean} [opts.addResolutionResponse=false] – If true, push resolution as a public response (manager behaviour)
 * @param {boolean} [opts.cleanMalformedResponses=false] – If true, filter out malformed responses (manager behaviour)
 * @returns {{ complaint, coinTransaction, coinsAwarded }} – updated complaint + coin transaction (or null)
 */
export async function resolveComplaintCore({
  complaint,
  resolution,
  resolverId,
  resolverModel,
  internalNotes,
  addResolutionResponse = false,
  cleanMalformedResponses = false,
}) {
  // Optionally clean malformed responses (manager behaviour)
  if (cleanMalformedResponses && complaint.responses?.length > 0) {
    complaint.responses = complaint.responses.filter((resp) => {
      if (!resp.respondedBy?.userType || !resp.respondedBy?.userId) {
        logger.warn(
          `Removing malformed response from complaint ${complaint._id}`
        );
        return false;
      }
      return true;
    });
  }

  // Update complaint fields
  complaint.status = "resolved";
  complaint.resolution = resolution;
  if (internalNotes) {
    complaint.internalNotes = internalNotes;
  }
  complaint.resolvedBy = resolverId;
  complaint.resolvedByModel = resolverModel;
  complaint.resolvedAt = new Date();
  complaint.canReopen = true;

  // Optionally add resolution as a public response
  if (addResolutionResponse) {
    complaint.responses.push({
      message: resolution,
      respondedBy: {
        userType: resolverModel.toLowerCase(),
        userId: resolverId,
      },
      respondedAt: new Date(),
      isPublic: true,
    });
  }

  // Status history
  complaint.statusHistory.push({
    status: "resolved",
    updatedBy: resolverId,
    updatedByModel: resolverModel,
    timestamp: new Date(),
    notes: `Resolved by ${resolverModel.toLowerCase()}: ${resolution.substring(0, 100)}`,
  });

  complaint.updatedBy = {
    userType: resolverModel.toLowerCase(),
    userId: resolverId,
    timestamp: new Date(),
  };

  // Coin compensation
  const coinsToAward = COIN_COMPENSATION[complaint.priority] || 100;
  complaint.coinCompensation = coinsToAward;

  await complaint.save();
  await complaint.populate("assignedTo", "name email role staffId");

  // Award coins
  let coinTransaction = null;
  try {
    coinTransaction = await CoinTransaction.createTransaction({
      user: complaint.user._id || complaint.user,
      hotel: complaint.hotel,
      branch: complaint.branch,
      amount: coinsToAward,
      type: "credit",
      source: "complaint_resolution",
      description: `Complaint resolved: ${complaint.title}`,
      metadata: {
        complaintId: complaint._id,
        complaintNumber: complaint.complaintId,
        priority: complaint.priority,
        resolvedBy: resolverModel,
        [`${resolverModel.toLowerCase()}Id`]: resolverId,
      },
      adminReason: "Complaint resolution compensation",
    });

    logger.info(
      `Awarded ${coinsToAward} coins to user ${complaint.user._id || complaint.user} for complaint ${complaint.complaintId} resolution`
    );
  } catch (coinError) {
    logger.error("Error awarding coins for complaint resolution:", coinError);
    // Don't fail the resolution if coin award fails
  }

  return { complaint, coinTransaction, coinsAwarded: coinsToAward };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Complaint analytics aggregation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Shared complaint analytics aggregation pipeline.
 *
 * @param {Object} baseFilter – Scope filter (e.g. hotel, branch, date range)
 * @returns {Object} analytics object ready for APIResponse
 */
export async function getComplaintAnalytics(baseFilter = {}) {
  const [
    totalComplaints,
    statusBreakdown,
    priorityBreakdown,
    categoryBreakdown,
    averageResolutionTime,
    recentComplaints,
  ] = await Promise.all([
    Complaint.countDocuments(baseFilter),

    Complaint.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    Complaint.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]),

    Complaint.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),

    Complaint.aggregate([
      {
        $match: {
          ...baseFilter,
          status: "resolved",
          resolvedAt: { $exists: true },
        },
      },
      {
        $project: {
          resolutionTime: {
            $divide: [
              { $subtract: ["$resolvedAt", "$createdAt"] },
              1000 * 60 * 60, // Convert to hours
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgResolutionTime: { $avg: "$resolutionTime" },
          minResolutionTime: { $min: "$resolutionTime" },
          maxResolutionTime: { $max: "$resolutionTime" },
        },
      },
    ]),

    Complaint.find(baseFilter)
      .populate("user", "name")
      .populate("branch", "name")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("complaintId title status priority category createdAt"),
  ]);

  const toMap = (arr) =>
    arr.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

  return {
    totalComplaints,
    statusBreakdown: toMap(statusBreakdown),
    priorityBreakdown: toMap(priorityBreakdown),
    categoryBreakdown: toMap(categoryBreakdown),
    averageResolutionTime: averageResolutionTime[0]
      ? {
          hours:
            Math.round(averageResolutionTime[0].avgResolutionTime * 10) / 10,
          days:
            Math.round((averageResolutionTime[0].avgResolutionTime / 24) * 10) /
            10,
          ...(averageResolutionTime[0].minResolutionTime !== undefined && {
            fastestHours:
              Math.round(averageResolutionTime[0].minResolutionTime * 100) /
              100,
            slowestHours:
              Math.round(averageResolutionTime[0].maxResolutionTime * 100) /
              100,
          }),
        }
      : null,
    recentComplaints,
  };
}

export default {
  resolveComplaintCore,
  getComplaintAnalytics,
  COIN_COMPENSATION,
};
