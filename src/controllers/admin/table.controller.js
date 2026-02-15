import mongoose from "mongoose";
import { Table, tableValidationSchemas } from "../../models/Table.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import qrCodeService from "../../services/qrCode.service.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import {
  updateResourceUsage,
  decreaseResourceUsage,
} from "../../middleware/subscriptionAuth.middleware.js";

/**
 * Generate QR codes for multiple tables
 * POST /api/v1/admin/tables/generate-qr
 */
export const generateTableQRCodes = async (req, res, next) => {
  try {
    const {
      hotel,
      branch,
      totalTables,
      startingNumber = 1,
      capacity = 4,
    } = req.body;

    // Validate request
    const { error } = tableValidationSchemas.generateQRBulk.validate(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Check if creating totalTables would exceed subscription limit (skip for super_admin)
    if (req.admin.role !== "super_admin") {
      const { AdminSubscription } =
        await import("../../models/AdminSubscription.model.js");
      const subscription = await AdminSubscription.findActiveSubscription(
        req.admin._id
      );

      if (subscription) {
        await subscription.populate("plan");
        const currentUsage = subscription.usage.tables || 0;
        const limit = subscription.plan.features.maxTables;
        const afterCreation = currentUsage + totalTables;

        if (afterCreation > limit) {
          return next(
            new APIError(
              403,
              `Cannot create ${totalTables} tables. Current usage: ${currentUsage}/${limit}. Creating ${totalTables} would exceed limit (${afterCreation}/${limit}). Available: ${
                limit - currentUsage
              }`
            )
          );
        }
      }
    }

    // Verify hotel exists, is active, and belongs to current admin
    const hotelDoc = await Hotel.findOne({
      _id: hotel,
      createdBy: req.admin._id,
    });
    if (!hotelDoc) {
      return next(new APIError(404, "Hotel not found or access denied"));
    }
    if (hotelDoc.status !== "active") {
      return next(new APIError(400, "Hotel is not active"));
    }

    // Verify branch exists if provided
    let branchDoc = null;
    if (branch) {
      branchDoc = await Branch.findOne({ _id: branch, hotel: hotel });
      if (!branchDoc) {
        return next(
          new APIError(404, "Branch not found or doesn't belong to this hotel")
        );
      }
      if (branchDoc.status !== "active") {
        return next(new APIError(400, "Branch is not active"));
      }
    }

    // Check for existing tables with same numbers
    const existingTables = await Table.find({
      hotel: hotel,
      branch: branch || null,
      tableNumber: {
        $in: Array.from({ length: totalTables }, (_, i) =>
          (startingNumber + i).toString()
        ),
      },
    });

    if (existingTables.length > 0) {
      const existingNumbers = existingTables
        .map((t) => t.tableNumber)
        .join(", ");
      return next(
        new APIError(
          400,
          `Tables already exist with numbers: ${existingNumbers}`
        )
      );
    }

    // Generate QR codes
    console.log(
      `Generating ${totalTables} QR codes for hotel ${hotel}${
        branch ? ` branch ${branch}` : ""
      }`
    );

    const qrCodes = await qrCodeService.generateBulkTableQRs(
      hotel,
      branch,
      totalTables,
      startingNumber,
      {
        qrOptions: qrCodeService.getQROptionsForType("table"),
      }
    );

    // Create table documents
    const tables = [];
    const errors = [];

    for (let i = 0; i < totalTables; i++) {
      try {
        const tableNumber = (startingNumber + i).toString();
        const qrCode = qrCodes[i];

        const table = new Table({
          tableNumber,
          hotel,
          branch: branch || undefined,
          capacity,

          qrCode: {
            data: qrCode.data,
            image: qrCode.image,
            scanUrl: qrCode.scanUrl,
            generatedAt: qrCode.generatedAt,
          },
          status: "available",
          isActive: true,
        });

        const savedTable = await table.save();
        tables.push(savedTable);
      } catch (error) {
        errors.push({
          tableNumber: (startingNumber + i).toString(),
          error: error.message,
        });
      }
    }

    // Update subscription usage counter ONCE after all tables are created (skip for super_admin)
    if (req.admin.role !== "super_admin" && tables.length > 0) {
      try {
        // Sync actual table count from database instead of incrementing
        const { syncResourceUsage } =
          await import("../../middleware/subscriptionAuth.middleware.js");
        await syncResourceUsage(req.admin._id, "tables");
      } catch (usageError) {
        console.error("Failed to update table usage counter:", usageError);
        // Log error but don't fail the request
      }
    }

    // Populate the saved tables
    const populatedTables = await Table.populate(tables, [
      { path: "hotel", select: "name hotelId location" },
      { path: "branch", select: "name branchId location" },
    ]);

    const response = {
      success: true,
      totalGenerated: tables.length,
      totalFailed: errors.length,
      tables: populatedTables.map((table) => ({
        id: table._id,
        tableNumber: table.tableNumber,
        uniqueId: table.uniqueId,
        qrCode: table.qrCode,
        capacity: table.capacity,
        location: table.location,
        hotel: table.hotel,
        branch: table.branch,
        status: table.status,
      })),
      errors: errors.length > 0 ? errors : undefined,
    };

    const statusCode = errors.length > 0 ? 207 : 201; // 207 Multi-Status if there were partial failures
    const message =
      errors.length > 0
        ? `Generated ${tables.length} tables successfully, ${errors.length} failed`
        : `Generated ${tables.length} table QR codes successfully`;

    res.status(statusCode).json(new APIResponse(statusCode, response, message));
  } catch (error) {
    next(error);
  }
};

/**
 * Get all tables for a hotel/branch
 * GET /api/v1/admin/tables
 */
export const getTables = async (req, res, next) => {
  try {
    const { hotel, branch, status, page = 1, limit = 20 } = req.query;

    if (!hotel) {
      return next(new APIError(400, "Hotel ID is required"));
    }

    // Verify hotel belongs to current admin
    const hotelDoc = await Hotel.findOne({
      _id: hotel,
      createdBy: req.admin._id,
    });
    if (!hotelDoc) {
      return next(new APIError(404, "Hotel not found or access denied"));
    }

    // Build query
    const query = { hotel };
    if (branch) query.branch = branch;
    if (status) query.status = status;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get tables with pagination
    const tables = await Table.find(query)
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location")
      .populate("currentOrder", "status totalPrice")
      .populate("currentCustomer", "name phone")
      .sort({ tableNumber: 1 })
      .limit(parseInt(limit))
      .skip(skip);

    // Get total count
    const total = await Table.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          tables,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
            hasNext: skip + tables.length < total,
            hasPrev: page > 1,
          },
        },
        "Tables retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get table details by ID
 * GET /api/v1/admin/tables/:tableId
 */
export const getTableById = async (req, res, next) => {
  try {
    const { tableId } = req.params;

    const table = await Table.findById(tableId)
      .populate({
        path: "hotel",
        select: "name hotelId location contact createdBy",
        match: { createdBy: req.admin._id },
      })
      .populate("branch", "name branchId location contact")
      .populate("currentOrder", "status totalPrice items createdAt")
      .populate("currentCustomer", "name email phone");

    if (!table || !table.hotel) {
      return next(new APIError(404, "Table not found or access denied"));
    }

    res
      .status(200)
      .json(
        new APIResponse(200, { table }, "Table details retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Update table details
 * PUT /api/v1/admin/tables/:tableId
 */
export const updateTable = async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const { capacity, notes, status } = req.body;

    const table = await Table.findById(tableId).populate({
      path: "hotel",
      select: "createdBy",
      match: { createdBy: req.admin._id },
    });
    if (!table || !table.hotel) {
      return next(new APIError(404, "Table not found or access denied"));
    }

    // Update allowed fields
    if (capacity !== undefined) table.capacity = capacity;
    if (notes !== undefined) table.notes = notes;
    if (status !== undefined) table.status = status;

    await table.save();

    const updatedTable = await Table.findById(tableId)
      .populate("hotel", "name hotelId location")
      .populate("branch", "name branchId location");

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { table: updatedTable },
          "Table updated successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Delete table
 * DELETE /api/v1/admin/tables/:tableId
 */
export const deleteTable = async (req, res, next) => {
  try {
    const { tableId } = req.params;

    const table = await Table.findById(tableId).populate({
      path: "hotel",
      select: "createdBy",
      match: { createdBy: req.admin._id },
    });
    if (!table || !table.hotel) {
      return next(new APIError(404, "Table not found or access denied"));
    }

    // Check if table is currently in use
    if (table.status === "occupied" || table.currentOrder) {
      return next(
        new APIError(400, "Cannot delete table that is currently in use")
      );
    }

    await Table.findByIdAndDelete(tableId);

    // Sync table usage counter from actual database count (skip for super_admin)
    if (req.admin.role !== "super_admin") {
      try {
        const { syncResourceUsage } =
          await import("../../middleware/subscriptionAuth.middleware.js");
        await syncResourceUsage(req.admin._id, "tables");
      } catch (usageError) {
        console.error("Failed to sync table usage counter:", usageError);
        // Log error but don't fail the deletion
      }
    }

    res
      .status(200)
      .json(new APIResponse(200, null, "Table deleted successfully"));
  } catch (error) {
    next(error);
  }
};

/**
 * Regenerate QR code for a table
 * POST /api/v1/admin/tables/:tableId/regenerate-qr
 */
export const regenerateTableQR = async (req, res, next) => {
  try {
    const { tableId } = req.params;

    const table = await Table.findById(tableId)
      .populate({
        path: "hotel",
        match: { createdBy: req.admin._id },
      })
      .populate("branch");
    if (!table || !table.hotel) {
      return next(new APIError(404, "Table not found or access denied"));
    }

    // Generate new QR code
    const qrCode = await qrCodeService.generateTableQR(
      table.hotel._id,
      table.branch?._id,
      table.tableNumber,
      {
        qrOptions: qrCodeService.getQROptionsForType("table"),
      }
    );

    // Update table with new QR code
    table.qrCode = {
      data: qrCode.data,
      image: qrCode.image,
      scanUrl: qrCode.scanUrl,
      generatedAt: qrCode.generatedAt,
    };

    await table.save();

    res.status(200).json(
      new APIResponse(
        200,
        {
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            qrCode: table.qrCode,
          },
        },
        "QR code regenerated successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get available tables for booking
 * GET /api/v1/admin/tables/available
 */
export const getAvailableTables = async (req, res, next) => {
  try {
    const { hotel, branch, capacity } = req.query;

    if (!hotel) {
      return next(new APIError(400, "Hotel ID is required"));
    }

    // Verify hotel belongs to current admin
    const hotelDoc = await Hotel.findOne({
      _id: hotel,
      createdBy: req.admin._id,
    });
    if (!hotelDoc) {
      return next(new APIError(404, "Hotel not found or access denied"));
    }

    const tables = await Table.findAvailable(hotel, branch, capacity);

    res.status(200).json(
      new APIResponse(
        200,
        {
          tables,
          count: tables.length,
        },
        "Available tables retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk update table status
 * PUT /api/v1/admin/tables/bulk-status
 */
export const bulkUpdateTableStatus = async (req, res, next) => {
  try {
    const { tableIds, status } = req.body;

    if (!Array.isArray(tableIds) || tableIds.length === 0) {
      return next(new APIError(400, "Table IDs array is required"));
    }

    if (!["available", "maintenance", "inactive"].includes(status)) {
      return next(
        new APIError(
          400,
          "Invalid status. Allowed: available, maintenance, inactive"
        )
      );
    }

    // Find tables that belong to hotels owned by the current admin
    const tables = await Table.find({ _id: { $in: tableIds } }).populate({
      path: "hotel",
      select: "createdBy",
      match: { createdBy: req.admin._id },
    });

    // Filter out tables that don't belong to admin's hotels
    const validTableIds = tables
      .filter((table) => table.hotel)
      .map((table) => table._id);

    if (validTableIds.length === 0) {
      return next(new APIError(404, "No accessible tables found"));
    }

    const result = await Table.updateMany(
      { _id: { $in: validTableIds } },
      {
        status,
        ...(status === "available" && {
          currentCustomer: null,
          currentOrder: null,
        }),
      }
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          updated: result.modifiedCount,
          matched: result.matchedCount,
        },
        `Updated ${result.modifiedCount} tables to ${status} status`
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get table statistics
 * GET /api/v1/admin/tables/stats
 */
export const getTableStats = async (req, res, next) => {
  try {
    const { hotel, branch } = req.query;

    if (!hotel) {
      return next(new APIError(400, "Hotel ID is required"));
    }

    // Verify hotel belongs to current admin
    const hotelDoc = await Hotel.findOne({
      _id: hotel,
      createdBy: req.admin._id,
    });
    if (!hotelDoc) {
      return next(new APIError(404, "Hotel not found or access denied"));
    }

    // Normalize branchId - convert empty string or null to null
    const normalizedBranchId = branch && branch !== "" ? branch : null;

    // Convert string IDs to ObjectIds for MongoDB matching
    const query = { hotel: new mongoose.Types.ObjectId(hotel) };
    if (normalizedBranchId) {
      query.branch = new mongoose.Types.ObjectId(normalizedBranchId);
    }
    // If no branch specified, show all tables for the hotel (don't add branch filter)

    const stats = await Table.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalTables: { $sum: 1 },
          available: {
            $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
          },
          occupied: {
            $sum: { $cond: [{ $eq: ["$status", "occupied"] }, 1, 0] },
          },
          reserved: {
            $sum: { $cond: [{ $eq: ["$status", "reserved"] }, 1, 0] },
          },
          maintenance: {
            $sum: { $cond: [{ $eq: ["$status", "maintenance"] }, 1, 0] },
          },
          inactive: {
            $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 1, 0] },
          },
          totalCapacity: { $sum: "$capacity" },
          totalOrders: { $sum: "$totalOrders" },
          totalRevenue: { $sum: "$totalRevenue" },
          averageCapacity: { $avg: "$capacity" },
        },
      },
    ]);

    const rawResult = stats[0] || {
      totalTables: 0,
      available: 0,
      occupied: 0,
      reserved: 0,
      maintenance: 0,
      inactive: 0,
      totalCapacity: 0,
      totalOrders: 0,
      totalRevenue: 0,
      averageCapacity: 0,
    };

    // Remove the _id field from aggregation result
    const { _id, ...result } = rawResult;

    // Calculate occupancy rate
    const occupancyRate =
      result.totalTables > 0
        ? ((result.occupied / result.totalTables) * 100).toFixed(2)
        : 0;

    result.occupancyRate = parseFloat(occupancyRate);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { stats: result },
          "Table statistics retrieved successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

export default {
  generateTableQRCodes,
  getTables,
  getTableById,
  updateTable,
  deleteTable,
  regenerateTableQR,
  getAvailableTables,
  bulkUpdateTableStatus,
  getTableStats,
};
