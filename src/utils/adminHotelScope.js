import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { APIError } from "./APIError.js";

/**
 * Get hotel IDs owned by the current admin and validate ownership
 * of any requested hotelId / branchId.
 *
 * @param {Object} req - Express request (needs req.user._id or req.admin._id)
 * @param {Object} [options]
 * @param {string} [options.hotelId]  - Optional hotel ID to validate ownership
 * @param {string} [options.branchId] - Optional branch ID to validate ownership
 * @returns {Promise<import("mongoose").Types.ObjectId[]>} Array of hotel ObjectIds owned by the admin
 */
export async function getAdminHotelScope(req, { hotelId, branchId } = {}) {
  const userRole = req.userRole;

  // Super admin can see all data — return null to signal "no hotel filter"
  if (userRole === "super_admin") {
    return null;
  }

  const adminId = req.user?._id || req.admin?._id;
  const adminHotels = await Hotel.find({ createdBy: adminId })
    .select("_id")
    .lean();
  const adminHotelIds = adminHotels.map((h) => h._id);

  if (adminHotelIds.length === 0) return adminHotelIds;

  // Validate requested hotelId belongs to this admin
  if (hotelId) {
    const isOwned = adminHotelIds.some(
      (id) => id.toString() === hotelId.toString()
    );
    if (!isOwned) {
      throw new APIError(403, "You do not have access to this hotel");
    }
  }

  // Validate requested branchId belongs to one of admin's hotels
  if (branchId) {
    const branch = await Branch.findById(branchId).select("hotel").lean();
    if (!branch) {
      throw new APIError(404, "Branch not found");
    }
    const branchHotelOwned = adminHotelIds.some(
      (id) => id.toString() === branch.hotel.toString()
    );
    if (!branchHotelOwned) {
      throw new APIError(403, "You do not have access to this branch");
    }
  }

  return adminHotelIds;
}
