// src/controllers/manager/tableController.js - Manager Table Management Controller
import { Table } from "../../models/Table.model.js";
import { Booking } from "../../models/Booking.model.js";
import { Order } from "../../models/Order.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import Joi from "joi";

/**
 * Get all tables for the branch
 * GET /api/v1/manager/tables
 * @access Manager
 */
export const getAllTables = async (req, res, next) => {
  try {
    const managerBranch = req.user.branch;
    const { status, floor, limit, skip, sortBy, sortOrder } = req.query;

    // Validate query parameters
    const { error } = validateTableQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Build filter for manager's branch
    const filter = { branch: managerBranch };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (floor) {
      filter.floor = floor;
    }

    // Build sort criteria
    const sort = {};
    sort[sortBy || "tableNumber"] = sortOrder === "asc" ? 1 : -1;

    // Get tables with current orders
    const tables = await Table.find(filter)
      .populate("currentOrder", "orderNumber status totalPrice createdAt")
      .populate("currentCustomer", "name email phone")
      .sort(sort)
      .collation({ locale: "en", numericOrdering: true })
      .limit(parseInt(limit) || 50)
      .skip(parseInt(skip) || 0);

    const totalCount = await Table.countDocuments(filter);

    // Get table statistics
    const statusStats = await Table.aggregate([
      { $match: { branch: managerBranch } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const stats = statusStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.status(200).json(
      new APIResponse(
        200,
        {
          tables,
          pagination: {
            total: totalCount,
            limit: parseInt(limit) || 50,
            skip: parseInt(skip) || 0,
            hasMore: (parseInt(skip) || 0) + tables.length < totalCount,
          },
          statistics: stats,
        },
        "Tables retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting tables:", error);
    next(error);
  }
};

/**
 * Get table details by ID
 * GET /api/v1/manager/tables/:tableId
 * @access Manager
 */
export const getTableDetails = async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const managerBranch = req.user.branch;

    // Validate table ID
    if (!tableId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid table ID"));
    }

    const table = await Table.findById(tableId)
      .populate("currentOrder", "orderNumber status totalPrice items createdAt")
      .populate("currentCustomer", "name email phone")
      .populate("branch", "name address");

    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    // Check if table belongs to manager's branch
    if (table.branch._id.toString() !== managerBranch.toString()) {
      return next(
        new APIError(403, "You can only view tables from your branch")
      );
    }

    // Get table history for last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentActivity = await Order.find({
      table: tableId,
      createdAt: { $gte: weekAgo },
    })
      .select("orderNumber status totalPrice createdAt completedAt")
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json(
      new APIResponse(
        200,
        {
          table,
          recentActivity,
        },
        "Table details retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting table details:", error);
    next(error);
  }
};

/**
 * Create new table
 * POST /api/v1/manager/tables
 * @access Manager
 */
export const createTable = async (req, res, next) => {
  try {
    const managerBranch = req.user.branch;
    const managerId = req.user._id;

    // Validate input
    const { error } = validateCreateTable(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    const { tableNumber, seatingCapacity, floor, section, location } = req.body;

    // Check if table number already exists in the branch
    const existingTable = await Table.findOne({
      branch: managerBranch,
      tableNumber: tableNumber,
    });

    if (existingTable) {
      return next(
        new APIError(400, "Table number already exists in this branch")
      );
    }

    // Create new table
    const newTable = new Table({
      tableNumber,
      seatingCapacity,
      floor,
      section,
      location,
      branch: managerBranch,
      status: "available",
      createdBy: managerId,
    });

    await newTable.save();

    logger.info(`Table ${tableNumber} created by manager ${managerId}`);

    res
      .status(201)
      .json(
        new APIResponse(201, { table: newTable }, "Table created successfully")
      );
  } catch (error) {
    logger.error("Error creating table:", error);
    next(error);
  }
};

/**
 * Update table information
 * PUT /api/v1/manager/tables/:tableId
 * @access Manager
 */
export const updateTable = async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const managerBranch = req.user.branch;
    const managerId = req.user._id;

    // Validate input
    const { error } = validateUpdateTable(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get table
    const table = await Table.findById(tableId);
    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    // Check branch access
    if (table.branch.toString() !== managerBranch.toString()) {
      return next(
        new APIError(403, "You can only update tables from your branch")
      );
    }

    // Check if table number conflict (if updating table number)
    if (req.body.tableNumber && req.body.tableNumber !== table.tableNumber) {
      const existingTable = await Table.findOne({
        branch: managerBranch,
        tableNumber: req.body.tableNumber,
        _id: { $ne: tableId },
      });

      if (existingTable) {
        return next(
          new APIError(400, "Table number already exists in this branch")
        );
      }
    }

    // Update table
    const allowedUpdates = [
      "tableNumber",
      "seatingCapacity",
      "floor",
      "section",
      "location",
      "isActive",
    ];
    const updates = {};
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    updates.updatedAt = new Date();
    updates.updatedBy = managerId;

    const updatedTable = await Table.findByIdAndUpdate(tableId, updates, {
      new: true,
    });

    logger.info(`Table ${tableId} updated by manager ${managerId}`);

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
    logger.error("Error updating table:", error);
    next(error);
  }
};

/**
 * Delete table
 * DELETE /api/v1/manager/tables/:tableId
 * @access Manager
 */
export const deleteTable = async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const managerBranch = req.user.branch;
    const managerId = req.user._id;

    // Get table
    const table = await Table.findById(tableId);
    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    // Check branch access
    if (table.branch.toString() !== managerBranch.toString()) {
      return next(
        new APIError(403, "You can only delete tables from your branch")
      );
    }

    // Check if table has active orders or reservations
    if (
      table.status === "occupied" ||
      table.currentOrder ||
      table.currentReservation
    ) {
      return next(
        new APIError(
          400,
          "Cannot delete table with active orders or reservations"
        )
      );
    }

    // Soft delete - mark as inactive instead of hard delete
    table.isActive = false;
    table.deletedAt = new Date();
    table.deletedBy = managerId;
    await table.save();

    logger.info(`Table ${tableId} deleted by manager ${managerId}`);

    res
      .status(200)
      .json(new APIResponse(200, { tableId }, "Table deleted successfully"));
  } catch (error) {
    logger.error("Error deleting table:", error);
    next(error);
  }
};

/**
 * Get table status overview
 * GET /api/v1/manager/tables/status/overview
 * @access Manager
 */
export const getTableStatus = async (req, res, next) => {
  try {
    const managerBranch = req.user.branch;

    // Get real-time table status
    const tables = await Table.find({
      branch: managerBranch,
      isActive: true,
    })
      .populate("currentOrder", "orderNumber status totalPrice createdAt")
      .populate("currentReservation", "customerName reservationTime partySize")
      .sort({ tableNumber: 1 })
      .collation({ locale: "en", numericOrdering: true });

    // Calculate status statistics
    const statusCounts = tables.reduce((acc, table) => {
      acc[table.status] = (acc[table.status] || 0) + 1;
      return acc;
    }, {});

    // Calculate occupancy rate
    const totalTables = tables.length;
    const occupiedTables = statusCounts.occupied || 0;
    const occupancyRate =
      totalTables > 0 ? ((occupiedTables / totalTables) * 100).toFixed(1) : 0;

    // Get tables needing attention
    const needsAttention = tables.filter(
      (table) =>
        table.status === "needs_cleaning" ||
        (table.currentOrder && table.currentOrder.status === "ready")
    );

    const statusOverview = {
      summary: {
        total: totalTables,
        available: statusCounts.available || 0,
        occupied: statusCounts.occupied || 0,
        reserved: statusCounts.reserved || 0,
        needsCleaning: statusCounts.needs_cleaning || 0,
        outOfOrder: statusCounts.out_of_order || 0,
        occupancyRate: parseFloat(occupancyRate),
      },
      tables: tables.map((table) => ({
        id: table._id,
        tableNumber: table.tableNumber,
        status: table.status,
        seatingCapacity: table.seatingCapacity,
        floor: table.floor,
        section: table.section,
        currentOrder: table.currentOrder
          ? {
              orderNumber: table.currentOrder.orderNumber,
              status: table.currentOrder.status,
              totalPrice: table.currentOrder.totalPrice,
              duration: Math.floor(
                (new Date() - table.currentOrder.createdAt) / (1000 * 60)
              ), // minutes
            }
          : null,
        currentReservation: table.currentReservation
          ? {
              customerName: table.currentReservation.customerName,
              reservationTime: table.currentReservation.reservationTime,
              partySize: table.currentReservation.partySize,
            }
          : null,
      })),
      needsAttention: needsAttention.length,
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          statusOverview,
          "Table status overview retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting table status:", error);
    next(error);
  }
};

/**
 * Update table status
 * PUT /api/v1/manager/tables/:tableId/status
 * @access Manager
 */
export const updateTableStatus = async (req, res, next) => {
  try {
    const { tableId } = req.params;
    const { status, notes } = req.body;
    const managerBranch = req.user.branch;
    const managerId = req.user._id;

    // Validate input
    const { error } = validateStatusUpdate({ tableId, status, notes });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get table
    const table = await Table.findById(tableId);
    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    // Check branch access
    if (table.branch.toString() !== managerBranch.toString()) {
      return next(
        new APIError(403, "You can only update tables from your branch")
      );
    }

    // Validate status transition
    const validTransitions = {
      available: ["occupied", "reserved", "needs_cleaning", "out_of_order"],
      occupied: ["available", "needs_cleaning"],
      reserved: ["available", "occupied"],
      needs_cleaning: ["available"],
      out_of_order: ["available"],
    };

    if (!validTransitions[table.status]?.includes(status)) {
      return next(
        new APIError(
          400,
          `Cannot change status from ${table.status} to ${status}`
        )
      );
    }

    // Update table status
    table.status = status;
    table.updatedAt = new Date();
    table.updatedBy = managerId;

    // Add to status history
    table.statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: managerId,
      notes,
    });

    await table.save();

    logger.info(
      `Table ${tableId} status updated to ${status} by manager ${managerId}`
    );

    res
      .status(200)
      .json(
        new APIResponse(200, { table }, `Table status updated to ${status}`)
      );
  } catch (error) {
    logger.error("Error updating table status:", error);
    next(error);
  }
};

/**
 * Get all reservations
 * GET /api/v1/manager/reservations
 * @access Manager
 */
export const getReservations = async (req, res, next) => {
  try {
    const managerBranch = req.user.branch;
    const { status, date, limit, skip, sortBy, sortOrder } = req.query;

    // Validate query parameters
    const { error } = validateReservationQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Build filter
    const filter = { branch: managerBranch };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      filter.reservationTime = { $gte: startDate, $lt: endDate };
    }

    // Build sort criteria
    const sort = {};
    sort[sortBy || "reservationTime"] = sortOrder === "asc" ? 1 : -1;

    // Get reservations
    const reservations = await Booking.find(filter)
      .populate("table", "tableNumber seatingCapacity floor")
      .populate("customer", "name phone email")
      .sort(sort)
      .limit(parseInt(limit) || 50)
      .skip(parseInt(skip) || 0);

    const totalCount = await Booking.countDocuments(filter);

    res.status(200).json(
      new APIResponse(
        200,
        {
          reservations,
          pagination: {
            total: totalCount,
            limit: parseInt(limit) || 50,
            skip: parseInt(skip) || 0,
            hasMore: (parseInt(skip) || 0) + reservations.length < totalCount,
          },
        },
        "Reservations retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting reservations:", error);
    next(error);
  }
};

/**
 * Create new reservation
 * POST /api/v1/manager/reservations
 * @access Manager
 */
export const createReservation = async (req, res, next) => {
  try {
    const managerBranch = req.user.branch;
    const managerId = req.user._id;

    // Validate input
    const { error } = validateCreateReservation(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    const {
      customerName,
      contactNumber,
      email,
      partySize,
      reservationTime,
      tableId,
      specialRequests,
      notes,
    } = req.body;

    // Check if table exists and is available
    const table = await Table.findById(tableId);
    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    if (table.branch.toString() !== managerBranch.toString()) {
      return next(new APIError(403, "Table not in your branch"));
    }

    // Check table capacity
    if (partySize > table.seatingCapacity) {
      return next(
        new APIError(
          400,
          `Party size exceeds table capacity (${table.seatingCapacity})`
        )
      );
    }

    // Check for conflicting reservations
    const conflictingReservation = await Booking.findOne({
      table: tableId,
      reservationTime: {
        $gte: new Date(
          new Date(reservationTime).getTime() - 2 * 60 * 60 * 1000
        ), // 2 hours before
        $lte: new Date(
          new Date(reservationTime).getTime() + 2 * 60 * 60 * 1000
        ), // 2 hours after
      },
      status: { $in: ["confirmed", "seated"] },
    });

    if (conflictingReservation) {
      return next(
        new APIError(400, "Table is already reserved for this time slot")
      );
    }

    // Create reservation
    const reservation = new Booking({
      customerName,
      contactNumber,
      email,
      partySize,
      reservationTime: new Date(reservationTime),
      table: tableId,
      branch: managerBranch,
      specialRequests,
      notes,
      status: "confirmed",
      createdBy: managerId,
    });

    await reservation.save();

    // Update table if reservation is for current time
    const now = new Date();
    const reservationDate = new Date(reservationTime);
    if (Math.abs(reservationDate - now) < 30 * 60 * 1000) {
      // Within 30 minutes
      table.status = "reserved";
      table.currentReservation = reservation._id;
      await table.save();
    }

    logger.info(
      `Reservation created for table ${tableId} by manager ${managerId}`
    );

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          { reservation },
          "Reservation created successfully"
        )
      );
  } catch (error) {
    logger.error("Error creating reservation:", error);
    next(error);
  }
};

/**
 * Update reservation
 * PUT /api/v1/manager/reservations/:reservationId
 * @access Manager
 */
export const updateReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const managerBranch = req.user.branch;
    const managerId = req.user._id;

    // Validate input
    const { error } = validateUpdateReservation(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get reservation
    const reservation = await Booking.findById(reservationId);
    if (!reservation) {
      return next(new APIError(404, "Reservation not found"));
    }

    // Check branch access
    if (reservation.branch.toString() !== managerBranch.toString()) {
      return next(
        new APIError(403, "You can only update reservations from your branch")
      );
    }

    // Update reservation
    const allowedUpdates = [
      "customerName",
      "contactNumber",
      "email",
      "partySize",
      "reservationTime",
      "specialRequests",
      "notes",
      "status",
    ];
    const updates = {};
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    updates.updatedAt = new Date();
    updates.updatedBy = managerId;

    const updatedReservation = await Booking.findByIdAndUpdate(
      reservationId,
      updates,
      { new: true }
    ).populate("table", "tableNumber seatingCapacity");

    logger.info(`Reservation ${reservationId} updated by manager ${managerId}`);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { reservation: updatedReservation },
          "Reservation updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error updating reservation:", error);
    next(error);
  }
};

/**
 * Cancel reservation
 * PUT /api/v1/manager/reservations/:reservationId/cancel
 * @access Manager
 */
export const cancelReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { reason } = req.body;
    const managerBranch = req.user.branch;
    const managerId = req.user._id;

    // Get reservation
    const reservation = await Booking.findById(reservationId).populate("table");
    if (!reservation) {
      return next(new APIError(404, "Reservation not found"));
    }

    // Check branch access
    if (reservation.branch.toString() !== managerBranch.toString()) {
      return next(
        new APIError(403, "You can only cancel reservations from your branch")
      );
    }

    // Check if already cancelled
    if (reservation.status === "cancelled") {
      return next(new APIError(400, "Reservation is already cancelled"));
    }

    // Update reservation status
    reservation.status = "cancelled";
    reservation.cancelledAt = new Date();
    reservation.cancelledBy = managerId;
    reservation.cancellationReason = reason;
    await reservation.save();

    // Update table status if it was reserved for this booking
    if (
      reservation.table &&
      reservation.table.currentReservation?.toString() === reservationId
    ) {
      reservation.table.status = "available";
      reservation.table.currentReservation = null;
      await reservation.table.save();
    }

    logger.info(
      `Reservation ${reservationId} cancelled by manager ${managerId}`
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { reservation },
          "Reservation cancelled successfully"
        )
      );
  } catch (error) {
    logger.error("Error cancelling reservation:", error);
    next(error);
  }
};

// Validation schemas
const validateTableQuery = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(
        "all",
        "available",
        "occupied",
        "reserved",
        "needs_cleaning",
        "out_of_order"
      )
      .optional(),
    floor: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    skip: Joi.number().integer().min(0).optional(),
    sortBy: Joi.string()
      .valid("tableNumber", "seatingCapacity", "floor", "status", "createdAt")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return schema.validate(data);
};

const validateCreateTable = (data) => {
  const schema = Joi.object({
    tableNumber: Joi.string().required(),
    seatingCapacity: Joi.number().integer().min(1).max(20).required(),
    floor: Joi.number().integer().min(1).optional(),
    section: Joi.string().max(50).optional(),
    location: Joi.string().max(100).optional(),
  });
  return schema.validate(data);
};

const validateUpdateTable = (data) => {
  const schema = Joi.object({
    tableNumber: Joi.string().optional(),
    seatingCapacity: Joi.number().integer().min(1).max(20).optional(),
    floor: Joi.number().integer().min(1).optional(),
    section: Joi.string().max(50).optional(),
    location: Joi.string().max(100).optional(),
    isActive: Joi.boolean().optional(),
  });
  return schema.validate(data);
};

const validateStatusUpdate = (data) => {
  const schema = Joi.object({
    tableId: Joi.string().length(24).hex().required(),
    status: Joi.string()
      .valid(
        "available",
        "occupied",
        "reserved",
        "needs_cleaning",
        "out_of_order"
      )
      .required(),
    notes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

const validateReservationQuery = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid("all", "confirmed", "seated", "completed", "cancelled", "no_show")
      .optional(),
    date: Joi.date().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    skip: Joi.number().integer().min(0).optional(),
    sortBy: Joi.string()
      .valid("reservationTime", "createdAt", "customerName", "partySize")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return schema.validate(data);
};

const validateCreateReservation = (data) => {
  const schema = Joi.object({
    customerName: Joi.string().min(2).max(100).required(),
    contactNumber: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .required(),
    email: Joi.string().email().optional(),
    partySize: Joi.number().integer().min(1).max(20).required(),
    reservationTime: Joi.date().greater("now").required(),
    tableId: Joi.string().length(24).hex().required(),
    specialRequests: Joi.string().max(500).optional(),
    notes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

const validateUpdateReservation = (data) => {
  const schema = Joi.object({
    customerName: Joi.string().min(2).max(100).optional(),
    contactNumber: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .optional(),
    email: Joi.string().email().optional(),
    partySize: Joi.number().integer().min(1).max(20).optional(),
    reservationTime: Joi.date().optional(),
    specialRequests: Joi.string().max(500).optional(),
    notes: Joi.string().max(500).optional(),
    status: Joi.string()
      .valid("confirmed", "seated", "completed", "cancelled", "no_show")
      .optional(),
  });
  return schema.validate(data);
};

export default {
  getAllTables,
  getTableDetails,
  createTable,
  updateTable,
  deleteTable,
  getTableStatus,
  updateTableStatus,
  getReservations,
  createReservation,
  updateReservation,
  cancelReservation,
};
