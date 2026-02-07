/**
 * Super Admin Commission Management Controller
 * Only super admins can set/update commission rates for hotels
 */

import { Hotel } from "../../models/Hotel.model.js";
import { Order } from "../../models/Order.model.js";
import * as commissionCalculator from "../../utils/commissionCalculator.js";

/**
 * Set or update commission configuration for a hotel
 * @route PUT /api/v1/super-admin/hotels/:hotelId/commission
 * @access Super Admin only
 */
export const setHotelCommission = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { type, rate, fixedAmount, status, notes } = req.body;

    // Validate commission type
    const validTypes = ["percentage", "fixed", "none"];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid commission type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Validate based on type
    if (type === "percentage") {
      if (rate === undefined || rate < 0 || rate > 1) {
        return res.status(400).json({
          success: false,
          message: "Rate must be between 0 and 1 (e.g., 0.05 for 5%)",
        });
      }
    }

    if (type === "fixed") {
      if (!fixedAmount || fixedAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Fixed amount must be greater than 0",
        });
      }
    }

    // Find hotel
    const hotel = await Hotel.findById(hotelId);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Update commission configuration
    hotel.commissionConfig = {
      type,
      rate: type === "percentage" ? rate : undefined,
      fixedAmount: type === "fixed" ? fixedAmount : undefined,
      status: status || "active",
      notes: notes || "",
      setBy: req.user._id,
      lastModified: new Date(),
    };

    await hotel.save();

    // Get formatted commission summary
    const summary = commissionCalculator.getCommissionSummary(hotel);

    return res.status(200).json({
      success: true,
      message: "Commission configuration updated successfully",
      data: {
        hotelId: hotel._id,
        hotelName: hotel.name,
        commissionConfig: hotel.commissionConfig,
        summary,
        setBy: {
          id: req.user._id,
          email: req.user.email,
        },
      },
    });
  } catch (error) {
    console.error("Error setting commission:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to set commission configuration",
      error: error.message,
    });
  }
};

/**
 * Get commission configuration for a hotel
 * @route GET /api/v1/super-admin/hotels/:hotelId/commission
 * @access Super Admin only
 */
export const getHotelCommission = async (req, res) => {
  try {
    const { hotelId } = req.params;

    const hotel = await Hotel.findById(hotelId).populate(
      "commissionConfig.setBy",
      "email name"
    );

    if (!hotel) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    // Get commission summary
    const summary = commissionCalculator.getCommissionSummary(hotel);

    // Calculate total commission collected
    const commissionStats = await Order.aggregate([
      {
        $match: {
          hotel: hotel._id,
          commissionAmount: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$commissionStatus",
          count: { $sum: 1 },
          totalCommission: { $sum: "$commissionAmount" },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        hotelId: hotel._id,
        hotelName: hotel.name,
        commissionConfig: hotel.commissionConfig,
        summary,
        statistics: commissionStats,
      },
    });
  } catch (error) {
    console.error("Error fetching commission:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch commission configuration",
      error: error.message,
    });
  }
};

/**
 * Get commission statistics for all hotels
 * @route GET /api/v1/super-admin/commission/statistics
 * @access Super Admin only
 */
export const getAllCommissionStatistics = async (req, res) => {
  try {
    // Get all hotels with commission
    const hotels = await Hotel.find({
      "commissionConfig.type": { $ne: "none" },
      "commissionConfig.status": "active",
    }).select("name commissionConfig");

    // Get aggregated commission data
    const commissionData = await Order.aggregate([
      {
        $match: {
          commissionAmount: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: {
            hotel: "$hotel",
            status: "$commissionStatus",
          },
          count: { $sum: 1 },
          totalOrders: { $sum: "$totalAmount" },
          totalCommission: { $sum: "$commissionAmount" },
        },
      },
      {
        $group: {
          _id: "$_id.hotel",
          statuses: {
            $push: {
              status: "$_id.status",
              count: "$count",
              totalOrders: "$totalOrders",
              totalCommission: "$totalCommission",
            },
          },
          totalCommission: { $sum: "$totalCommission" },
        },
      },
      {
        $lookup: {
          from: "hotels",
          localField: "_id",
          foreignField: "_id",
          as: "hotel",
        },
      },
      {
        $unwind: "$hotel",
      },
      {
        $sort: { totalCommission: -1 },
      },
    ]);

    // Calculate overall statistics
    const overallStats = {
      totalHotels: hotels.length,
      totalCommissionCollected: commissionData.reduce(
        (sum, h) => sum + h.totalCommission,
        0
      ),
      byType: {
        percentage: hotels.filter(
          (h) => h.commissionConfig.type === "percentage"
        ).length,
        fixed: hotels.filter((h) => h.commissionConfig.type === "fixed").length,
        none: hotels.filter((h) => h.commissionConfig.type === "none").length,
      },
    };

    return res.status(200).json({
      success: true,
      data: {
        overallStats,
        hotelCommissions: commissionData.map((item) => ({
          hotelId: item.hotel._id,
          hotelName: item.hotel.name,
          commissionType: item.hotel.commissionConfig?.type,
          commissionRate: item.hotel.commissionConfig?.rate,
          fixedAmount: item.hotel.commissionConfig?.fixedAmount,
          totalCommission: item.totalCommission,
          statuses: item.statuses,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching commission statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch commission statistics",
      error: error.message,
    });
  }
};

/**
 * Mark commission as paid for orders
 * @route POST /api/v1/super-admin/commission/mark-paid
 * @access Super Admin only
 */
export const markCommissionPaid = async (req, res) => {
  try {
    const { orderIds, notes } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order IDs array is required",
      });
    }

    // Update orders
    const result = await Order.updateMany(
      {
        _id: { $in: orderIds },
        commissionStatus: "due",
      },
      {
        $set: {
          commissionStatus: "paid",
          commissionPaidAt: new Date(),
          commissionPaidBy: req.user._id,
          commissionNotes: notes || "Marked as paid by super admin",
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: `Successfully marked ${result.modifiedCount} orders as paid`,
      data: {
        updatedCount: result.modifiedCount,
        totalRequested: orderIds.length,
      },
    });
  } catch (error) {
    console.error("Error marking commission paid:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark commission as paid",
      error: error.message,
    });
  }
};

/**
 * Waive commission for specific orders
 * @route POST /api/v1/super-admin/commission/waive
 * @access Super Admin only
 */
export const waiveCommission = async (req, res) => {
  try {
    const { orderIds, reason } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order IDs array is required",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Reason for waiving commission is required",
      });
    }

    // Update orders
    const result = await Order.updateMany(
      {
        _id: { $in: orderIds },
        commissionStatus: { $in: ["pending", "due"] },
      },
      {
        $set: {
          commissionStatus: "waived",
          commissionAmount: 0,
          commissionWaivedAt: new Date(),
          commissionWaivedBy: req.user._id,
          commissionNotes: reason,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: `Successfully waived commission for ${result.modifiedCount} orders`,
      data: {
        waivedCount: result.modifiedCount,
        totalRequested: orderIds.length,
        reason,
      },
    });
  } catch (error) {
    console.error("Error waiving commission:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to waive commission",
      error: error.message,
    });
  }
};

/**
 * Set commission for ALL hotels at once (bulk operation)
 * @route POST /api/v1/super-admin/commission/bulk-set
 * @access Super Admin only
 */
export const bulkSetCommission = async (req, res) => {
  try {
    const {
      type,
      rate,
      fixedAmount,
      status,
      notes,
      excludeHotelIds = [],
    } = req.body;

    // Validate commission type
    const validTypes = ["percentage", "fixed", "none"];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid commission type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Validate based on type
    if (type === "percentage" && (rate === undefined || rate < 0 || rate > 1)) {
      return res.status(400).json({
        success: false,
        message: "Rate must be between 0 and 1 (e.g., 0.05 for 5%)",
      });
    }

    if (type === "fixed" && (!fixedAmount || fixedAmount <= 0)) {
      return res.status(400).json({
        success: false,
        message: "Fixed amount must be greater than 0",
      });
    }

    // Build query to exclude specific hotels
    const query =
      excludeHotelIds.length > 0 ? { _id: { $nin: excludeHotelIds } } : {};

    // Update all hotels
    const result = await Hotel.updateMany(query, {
      $set: {
        "commissionConfig.type": type,
        "commissionConfig.rate": type === "percentage" ? rate : undefined,
        "commissionConfig.fixedAmount":
          type === "fixed" ? fixedAmount : undefined,
        "commissionConfig.status": status || "active",
        "commissionConfig.notes":
          notes || "Bulk commission update by super admin",
        "commissionConfig.setBy": req.user._id,
        "commissionConfig.lastModified": new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Successfully set commission for ${result.modifiedCount} hotels`,
      data: {
        updatedCount: result.modifiedCount,
        commissionConfig: {
          type,
          rate: type === "percentage" ? rate : undefined,
          fixedAmount: type === "fixed" ? fixedAmount : undefined,
          status: status || "active",
        },
        excludedHotels: excludeHotelIds.length,
        setBy: {
          id: req.user._id,
          email: req.user.email,
        },
      },
    });
  } catch (error) {
    console.error("Error bulk setting commission:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to bulk set commission",
      error: error.message,
    });
  }
};

/**
 * Update commission for ALL hotels at once (bulk operation)
 * @route PUT /api/v1/super-admin/commission/bulk-update
 * @access Super Admin only
 */
export const bulkUpdateCommission = async (req, res) => {
  try {
    const {
      type,
      rate,
      fixedAmount,
      status,
      notes,
      applyToHotelIds = [],
    } = req.body;

    // If specific hotel IDs provided, only update those
    const query =
      applyToHotelIds.length > 0 ? { _id: { $in: applyToHotelIds } } : {};

    // Build update object dynamically
    const updateFields = {
      "commissionConfig.lastModified": new Date(),
      "commissionConfig.setBy": req.user._id,
    };

    if (type) {
      const validTypes = ["percentage", "fixed", "none"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid commission type. Must be one of: ${validTypes.join(", ")}`,
        });
      }
      updateFields["commissionConfig.type"] = type;
    }

    if (rate !== undefined) {
      if (rate < 0 || rate > 1) {
        return res.status(400).json({
          success: false,
          message: "Rate must be between 0 and 1",
        });
      }
      updateFields["commissionConfig.rate"] = rate;
    }

    if (fixedAmount !== undefined) {
      if (fixedAmount < 0) {
        return res.status(400).json({
          success: false,
          message: "Fixed amount cannot be negative",
        });
      }
      updateFields["commissionConfig.fixedAmount"] = fixedAmount;
    }

    if (status) {
      updateFields["commissionConfig.status"] = status;
    }

    if (notes) {
      updateFields["commissionConfig.notes"] = notes;
    }

    // Update hotels
    const result = await Hotel.updateMany(query, { $set: updateFields });

    return res.status(200).json({
      success: true,
      message: `Successfully updated commission for ${result.modifiedCount} hotels`,
      data: {
        updatedCount: result.modifiedCount,
        updatedFields: Object.keys(updateFields).map((key) =>
          key.replace("commissionConfig.", "")
        ),
        targetedHotels: applyToHotelIds.length || "all",
        setBy: {
          id: req.user._id,
          email: req.user.email,
        },
      },
    });
  } catch (error) {
    console.error("Error bulk updating commission:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to bulk update commission",
      error: error.message,
    });
  }
};

/**
 * Delete/Reset commission for ALL hotels (bulk operation)
 * @route DELETE /api/v1/super-admin/commission/bulk-delete
 * @access Super Admin only
 */
export const bulkDeleteCommission = async (req, res) => {
  try {
    const { hotelIds = [], reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Reason for deleting commission is required",
      });
    }

    // Build query
    const query = hotelIds.length > 0 ? { _id: { $in: hotelIds } } : {};

    // Reset commission to 'none'
    const result = await Hotel.updateMany(query, {
      $set: {
        "commissionConfig.type": "none",
        "commissionConfig.rate": undefined,
        "commissionConfig.fixedAmount": undefined,
        "commissionConfig.status": "waived",
        "commissionConfig.notes": `Commission removed: ${reason}`,
        "commissionConfig.setBy": req.user._id,
        "commissionConfig.lastModified": new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Successfully removed commission for ${result.modifiedCount} hotels`,
      data: {
        updatedCount: result.modifiedCount,
        targetedHotels: hotelIds.length || "all",
        reason,
        deletedBy: {
          id: req.user._id,
          email: req.user.email,
        },
      },
    });
  } catch (error) {
    console.error("Error bulk deleting commission:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to bulk delete commission",
      error: error.message,
    });
  }
};
