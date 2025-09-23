/**
 * ID Resolution Utilities
 * Resolves auto-generated IDs to MongoDB ObjectIds
 */

import mongoose from "mongoose";
import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
// Note: FoodCategory import will be added dynamically to avoid circular dependency

/**
 * Check if a string is a valid MongoDB ObjectId
 * @param {string} id - The ID to check
 * @returns {boolean} True if valid ObjectId
 */
export const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id) && id.length === 24;
};

/**
 * Resolve hotel ID (accepts both MongoDB ObjectId and hotelId)
 * @param {string} hotelIdentifier - Either MongoDB ObjectId or hotelId (e.g., "HTL-2025-00001")
 * @returns {Promise<string|null>} MongoDB ObjectId or null if not found
 */
export const resolveHotelId = async (hotelIdentifier) => {
  if (!hotelIdentifier) return null;

  try {
    // If it's already a valid MongoDB ObjectId, return it
    if (isValidObjectId(hotelIdentifier)) {
      // Verify the hotel exists
      const hotel = await Hotel.findById(hotelIdentifier).select("_id");
      return hotel ? hotelIdentifier : null;
    }

    // If it's an auto-generated hotelId, find the MongoDB ObjectId
    const hotel = await Hotel.findOne({ hotelId: hotelIdentifier }).select(
      "_id"
    );
    return hotel ? hotel._id.toString() : null;
  } catch (error) {
    console.error("Error resolving hotel ID:", error);
    return null;
  }
};

/**
 * Resolve branch ID (accepts both MongoDB ObjectId and branchId)
 * @param {string} branchIdentifier - Either MongoDB ObjectId or branchId (e.g., "BRN-HTL001-00001")
 * @param {string} hotelId - Optional hotel ID to validate branch belongs to hotel
 * @returns {Promise<string|null>} MongoDB ObjectId or null if not found
 */
export const resolveBranchId = async (branchIdentifier, hotelId = null) => {
  if (!branchIdentifier) return null;

  try {
    let query = {};

    // If it's already a valid MongoDB ObjectId
    if (isValidObjectId(branchIdentifier)) {
      query._id = branchIdentifier;
    } else {
      // If it's an auto-generated branchId
      query.branchId = branchIdentifier;
    }

    // Add hotel filter if provided
    if (hotelId) {
      const resolvedHotelId = await resolveHotelId(hotelId);
      if (resolvedHotelId) {
        query.hotel = resolvedHotelId;
      }
    }

    const branch = await Branch.findOne(query).select("_id");
    return branch ? branch._id.toString() : null;
  } catch (error) {
    console.error("Error resolving branch ID:", error);
    return null;
  }
};

/**
 * Resolve multiple hotel IDs
 * @param {string[]} hotelIdentifiers - Array of hotel identifiers
 * @returns {Promise<string[]>} Array of resolved MongoDB ObjectIds
 */
export const resolveMultipleHotelIds = async (hotelIdentifiers) => {
  if (!Array.isArray(hotelIdentifiers)) return [];

  const resolvedIds = await Promise.all(
    hotelIdentifiers.map((identifier) => resolveHotelId(identifier))
  );

  return resolvedIds.filter((id) => id !== null);
};

/**
 * Resolve multiple branch IDs
 * @param {string[]} branchIdentifiers - Array of branch identifiers
 * @param {string} hotelId - Optional hotel ID to validate branches
 * @returns {Promise<string[]>} Array of resolved MongoDB ObjectIds
 */
export const resolveMultipleBranchIds = async (
  branchIdentifiers,
  hotelId = null
) => {
  if (!Array.isArray(branchIdentifiers)) return [];

  const resolvedIds = await Promise.all(
    branchIdentifiers.map((identifier) => resolveBranchId(identifier, hotelId))
  );

  return resolvedIds.filter((id) => id !== null);
};

/**
 * Get hotel details by identifier
 * @param {string} hotelIdentifier - Either MongoDB ObjectId or hotelId
 * @returns {Promise<Object|null>} Hotel document or null
 */
export const getHotelByIdentifier = async (hotelIdentifier) => {
  if (!hotelIdentifier) return null;

  try {
    let query = {};

    if (isValidObjectId(hotelIdentifier)) {
      query._id = hotelIdentifier;
    } else {
      query.hotelId = hotelIdentifier;
    }

    return await Hotel.findOne(query);
  } catch (error) {
    console.error("Error getting hotel by identifier:", error);
    return null;
  }
};

/**
 * Get branch details by identifier
 * @param {string} branchIdentifier - Either MongoDB ObjectId or branchId
 * @param {string} hotelId - Optional hotel ID to validate branch
 * @returns {Promise<Object|null>} Branch document or null
 */
export const getBranchByIdentifier = async (
  branchIdentifier,
  hotelId = null
) => {
  if (!branchIdentifier) return null;

  try {
    let query = {};

    if (isValidObjectId(branchIdentifier)) {
      query._id = branchIdentifier;
    } else {
      query.branchId = branchIdentifier;
    }

    if (hotelId) {
      const resolvedHotelId = await resolveHotelId(hotelId);
      if (resolvedHotelId) {
        query.hotel = resolvedHotelId;
      }
    }

    return await Branch.findOne(query).populate("hotel", "name hotelId");
  } catch (error) {
    console.error("Error getting branch by identifier:", error);
    return null;
  }
};

/**
 * Resolve category ID (accepts both MongoDB ObjectId and categoryId)
 * @param {string} categoryIdentifier - Either MongoDB ObjectId or categoryId (e.g., "CAT-2025-00001")
 * @returns {Promise<string|null>} MongoDB ObjectId or null if not found
 */
export const resolveCategoryId = async (categoryIdentifier) => {
  if (!categoryIdentifier) return null;

  try {
    // Dynamically import to avoid circular dependency
    const { FoodCategory } = await import("../models/FoodCategory.model.js");

    // If it's already a valid MongoDB ObjectId, return it
    if (isValidObjectId(categoryIdentifier)) {
      // Verify the category exists
      const category = await FoodCategory.findById(categoryIdentifier).select(
        "_id"
      );
      return category ? categoryIdentifier : null;
    }

    // If it's an auto-generated categoryId, find the MongoDB ObjectId
    const category = await FoodCategory.findOne({
      categoryId: categoryIdentifier,
    }).select("_id");
    return category ? category._id.toString() : null;
  } catch (error) {
    console.error("Error resolving category ID:", error);
    return null;
  }
};

/**
 * Get category details by identifier
 * @param {string} categoryIdentifier - Either MongoDB ObjectId or categoryId
 * @returns {Promise<Object|null>} Category document or null
 */
export const getCategoryByIdentifier = async (categoryIdentifier) => {
  if (!categoryIdentifier) return null;

  try {
    // Dynamically import to avoid circular dependency
    const { FoodCategory } = await import("../models/FoodCategory.model.js");

    let query = {};

    if (isValidObjectId(categoryIdentifier)) {
      query._id = categoryIdentifier;
    } else {
      query.categoryId = categoryIdentifier;
    }

    return await FoodCategory.findOne(query).populate(
      "branch hotel",
      "name branchId hotelId"
    );
  } catch (error) {
    console.error("Error getting category by identifier:", error);
    return null;
  }
};

export default {
  isValidObjectId,
  resolveHotelId,
  resolveBranchId,
  resolveCategoryId,
  resolveMultipleHotelIds,
  resolveMultipleBranchIds,
  getHotelByIdentifier,
  getBranchByIdentifier,
  getCategoryByIdentifier,
};
