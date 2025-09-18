/**
 * ID Generation Utilities for Hotel Management System
 * Generates unique IDs for Hotels, Branches, Managers, and Staff
 */

import crypto from "crypto";

/**
 * Generate Hotel ID
 * Format: HTL-YYYY-XXXXX (e.g., HTL-2025-00001)
 * @param {number} counter - Sequential counter for uniqueness
 * @returns {string} Generated hotel ID
 */
export const generateHotelId = (counter = 1) => {
  const year = new Date().getFullYear();
  const paddedCounter = counter.toString().padStart(5, "0");
  return `HTL-${year}-${paddedCounter}`;
};

/**
 * Generate Branch ID
 * Format: BRN-HOTELCODE-XXXXX (e.g., BRN-HTL001-00001)
 * @param {string} hotelId - Parent hotel ID
 * @param {number} counter - Sequential counter for uniqueness
 * @returns {string} Generated branch ID
 */
export const generateBranchId = (hotelId, counter = 1) => {
  // Extract hotel code from hotelId (HTL-2025-00001 -> HTL001)
  const hotelCode =
    hotelId.replace(/HTL-\d{4}-0*/, "HTL").substring(0, 6) +
    counter.toString().padStart(3, "0");
  const paddedCounter = counter.toString().padStart(5, "0");
  return `BRN-${hotelCode}-${paddedCounter}`;
};

/**
 * Generate Manager Employee ID
 * Format: MGR-YYYY-XXXXX (e.g., MGR-2025-00001)
 * @param {number} counter - Sequential counter for uniqueness
 * @returns {string} Generated manager employee ID
 */
export const generateManagerId = (counter = 1) => {
  const year = new Date().getFullYear();
  const paddedCounter = counter.toString().padStart(5, "0");
  return `MGR-${year}-${paddedCounter}`;
};

/**
 * Generate Staff ID
 * Format: STF-ROLE-YYYY-XXXXX (e.g., STF-WTR-2025-00001)
 * @param {string} role - Staff role (waiter, kitchen_staff, etc.)
 * @param {number} counter - Sequential counter for uniqueness
 * @returns {string} Generated staff ID
 */
export const generateStaffId = (role, counter = 1) => {
  const year = new Date().getFullYear();
  const paddedCounter = counter.toString().padStart(5, "0");

  // Role abbreviations
  const roleAbbreviations = {
    waiter: "WTR",
    kitchen_staff: "KTN",
    cleaning_staff: "CLN",
    cashier: "CSH",
    receptionist: "RCP",
    security: "SEC",
  };

  const roleCode = roleAbbreviations[role] || "STF";
  return `STF-${roleCode}-${year}-${paddedCounter}`;
};

/**
 * Generate unique code for various purposes
 * @param {string} prefix - Prefix for the code
 * @param {number} length - Length of random part (default: 8)
 * @returns {string} Generated unique code
 */
export const generateUniqueCode = (prefix = "CODE", length = 8) => {
  const randomString = crypto
    .randomBytes(length)
    .toString("hex")
    .toUpperCase()
    .substring(0, length);
  return `${prefix}-${randomString}`;
};

/**
 * Get next counter value for ID generation
 * @param {Object} Model - Mongoose model to count documents
 * @param {string} fieldName - Field name to count (e.g., 'hotelId', 'branchId')
 * @param {string} prefix - Prefix to filter by (e.g., 'HTL-2025')
 * @returns {Promise<number>} Next counter value
 */
export const getNextCounter = async (Model, fieldName, prefix) => {
  try {
    const count = await Model.countDocuments({
      [fieldName]: new RegExp(
        `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
      ),
    });
    return count + 1;
  } catch (error) {
    console.error(`Error getting next counter for ${fieldName}:`, error);
    return 1; // Fallback to 1 if error occurs
  }
};

/**
 * Generate Order ID
 * Format: ORD-BRANCHCODE-YYYYMMDD-XXXXX
 * @param {string} branchId - Branch ID
 * @param {number} counter - Daily counter
 * @returns {string} Generated order ID
 */
export const generateOrderId = (branchId, counter = 1) => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, "0") +
    today.getDate().toString().padStart(2, "0");

  // Extract branch code (BRN-HTL001-00001 -> BRN001)
  const branchCode =
    branchId.replace(/BRN-\w+-0*/, "BRN").substring(0, 6) +
    counter.toString().padStart(3, "0");
  const paddedCounter = counter.toString().padStart(5, "0");

  return `ORD-${branchCode}-${dateStr}-${paddedCounter}`;
};

/**
 * Generate Booking ID
 * Format: BKG-YYYYMMDD-XXXXX
 * @param {number} counter - Daily counter
 * @returns {string} Generated booking ID
 */
export const generateBookingId = (counter = 1) => {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, "0") +
    today.getDate().toString().padStart(2, "0");

  const paddedCounter = counter.toString().padStart(5, "0");
  return `BKG-${dateStr}-${paddedCounter}`;
};

export default {
  generateHotelId,
  generateBranchId,
  generateManagerId,
  generateStaffId,
  generateUniqueCode,
  getNextCounter,
  generateOrderId,
  generateBookingId,
};
