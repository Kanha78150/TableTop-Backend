import mongoose from "mongoose";
import { Table, tableValidationSchemas } from "../../models/Table.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import { User } from "../../models/User.model.js";
import { FoodCategory } from "../../models/FoodCategory.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import qrCodeService from "../../services/qrCodeService.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import jwt from "jsonwebtoken";

/**
 * Handle QR code scan
 * GET /api/v1/scan
 * Query params: hotelId, branchId (optional), tableNo
 */
export const handleQRScan = async (req, res, next) => {
  try {
    const { hotelId, branchId, tableNo } = req.query;

    // Validate scan parameters
    const { error } = tableValidationSchemas.qrScan.validate({
      hotelId,
      branchId,
      tableNo,
    });

    if (error) {
      return next(new APIError(400, "Invalid QR code data", error.details));
    }

    // Find the table
    const table = await Table.findByQRData(hotelId, branchId, tableNo);
    if (!table) {
      return next(new APIError(404, "Table not found or inactive"));
    }

    // Check if hotel/branch is active
    if (!table.hotel || table.hotel.status !== "active") {
      return next(new APIError(400, "Hotel is currently inactive"));
    }

    if (table.branch && table.branch.status !== "active") {
      return next(new APIError(400, "Branch is currently inactive"));
    }

    // Check authentication from token (if provided)
    let user = null;
    let isAuthenticated = false;

    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = await User.findById(decoded._id);
        if (user) {
          isAuthenticated = true;
        }
      } catch (err) {
        // Token invalid, continue as unauthenticated
        console.log("Invalid token provided:", err.message);
      }
    }

    if (!isAuthenticated) {
      // User is not authenticated
      return res.status(200).json(
        new APIResponse(
          200,
          {
            authenticated: false,
            message: "Please signup or login first",
            table: {
              tableNumber: table.tableNumber,
              capacity: table.capacity,
              location: table.location,
            },
            hotel: {
              name: table.hotel.name,
              location: table.hotel.location,
            },
            branch: table.branch
              ? {
                  name: table.branch.name,
                  location: table.branch.location,
                }
              : null,
            redirectUrl: `${
              process.env.FRONTEND_URL
            }/auth?redirect=${encodeURIComponent(
              `/menu?hotelId=${hotelId}&branchId=${
                branchId || ""
              }&tableNo=${tableNo}`
            )}`,
          },
          "Please signup or login to continue"
        )
      );
    }

    // User is authenticated - get menu data
    const menuData = await getMenuData(hotelId, branchId);

    // Update table status if needed
    if (table.status === "available") {
      table.currentCustomer = user._id;
      table.lastUsed = new Date();
      await table.save();
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          authenticated: true,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
          },
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity,
            location: table.location,
            status: table.status,
            features: table.features,
          },
          hotel: {
            id: table.hotel._id,
            name: table.hotel.name,
            location: table.hotel.location,
            contact: table.hotel.contact,
          },
          branch: table.branch
            ? {
                id: table.branch._id,
                name: table.branch.name,
                location: table.branch.location,
                contact: table.branch.contact,
              }
            : null,
          menu: menuData,
          scanData: {
            hotelId,
            branchId: branchId || null,
            tableNo,
            scannedAt: new Date().toISOString(),
          },
        },
        "QR scan successful - welcome to the menu!"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Validate QR scan data
 * POST /api/v1/scan/validate
 */
export const validateQRScan = async (req, res, next) => {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      return next(new APIError(400, "QR code data is required"));
    }

    // Parse QR data
    const scanData = qrCodeService.parseQRScanData(qrData);

    // Validate the parsed data
    if (!qrCodeService.validateQRData(scanData)) {
      return next(new APIError(400, "Invalid QR code data"));
    }

    // Check if table exists
    const table = await Table.findByQRData(
      scanData.hotelId,
      scanData.branchId,
      scanData.tableNo
    );

    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          valid: true,
          scanData,
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            status: table.status,
          },
          redirectUrl: qrCodeService.generateScanUrl(
            scanData.hotelId,
            scanData.branchId,
            scanData.tableNo
          ),
        },
        "QR code is valid"
      )
    );
  } catch (error) {
    if (error instanceof APIError) {
      return next(error);
    }
    next(new APIError(400, "Invalid QR code", [error.message]));
  }
};

/**
 * Get table info by scan parameters (for mobile app direct scan)
 * GET /api/v1/scan/table-info
 */
export const getTableInfo = async (req, res, next) => {
  try {
    const { hotelId, branchId, tableNo } = req.query;

    // Validate parameters
    const { error } = tableValidationSchemas.qrScan.validate({
      hotelId,
      branchId,
      tableNo,
    });

    if (error) {
      return next(new APIError(400, "Invalid parameters", error.details));
    }

    // Find table
    const table = await Table.findByQRData(hotelId, branchId, tableNo);
    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity,
            location: table.location,
            status: table.status,
            features: table.features,
          },
          hotel: {
            id: table.hotel._id,
            name: table.hotel.name,
            location: table.hotel.location,
          },
          branch: table.branch
            ? {
                id: table.branch._id,
                name: table.branch.name,
                location: table.branch.location,
              }
            : null,
          qrCode: {
            scanUrl: table.qrCode.scanUrl,
            generatedAt: table.qrCode.generatedAt,
          },
        },
        "Table information retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Record table scan event (for analytics)
 * POST /api/v1/scan/record
 */
export const recordScanEvent = async (req, res, next) => {
  try {
    const { hotelId, branchId, tableNo } = req.body;

    // Automatically extract userAgent and IP from request
    const userAgent = req.headers["user-agent"] || "Unknown";
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.headers["x-real-ip"] ||
      req.ip ||
      req.connection.remoteAddress ||
      "Unknown";

    // Find table
    const table = await Table.findByQRData(hotelId, branchId, tableNo);
    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    // Here you could save scan analytics to a separate collection
    // For now, we'll just update the table's last used timestamp
    table.lastUsed = new Date();
    await table.save();

    // Log analytics data (in production, save to analytics collection)
    console.log("QR Scan Event:", {
      hotelId,
      branchId,
      tableNo,
      userAgent,
      ip,
      timestamp: new Date(),
    });

    res.status(200).json(
      new APIResponse(
        200,
        {
          recorded: true,
          timestamp: new Date(),
          userAgent,
          ip,
        },
        "Scan event recorded successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Helper function to get menu data for hotel/branch
 */
const getMenuData = async (hotelId, branchId) => {
  try {
    // Convert string IDs to ObjectIds for MongoDB matching
    const query = {
      hotel: new mongoose.Types.ObjectId(hotelId),
      isActive: true,
    };

    if (branchId && branchId !== "null" && branchId !== "undefined") {
      query.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Get categories
    const categories = await FoodCategory.find(query)
      .select("name description image")
      .sort({ name: 1 });

    // Get food items (separate query without isActive filter)
    const foodItemQuery = {
      hotel: new mongoose.Types.ObjectId(hotelId),
      isAvailable: true,
    };

    if (branchId && branchId !== "null" && branchId !== "undefined") {
      foodItemQuery.branch = new mongoose.Types.ObjectId(branchId);
    }

    const foodItems = await FoodItem.find(foodItemQuery)
      .populate("category", "name")
      .select(
        "name description price discountPrice image foodType spiceLevel preparationTime category allergens"
      )
      .sort({ name: 1 });

    // Group items by category
    const categorizedMenu = categories.map((category) => ({
      id: category._id,
      name: category.name,
      description: category.description,
      image: category.image,
      items: foodItems.filter(
        (item) =>
          item.category &&
          item.category._id.toString() === category._id.toString()
      ),
    }));

    return {
      categories: categorizedMenu,
      totalCategories: categories.length,
      totalItems: foodItems.length,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching menu data:", error);
    return {
      categories: [],
      totalCategories: 0,
      totalItems: 0,
      error: "Failed to load menu data",
    };
  }
};

/**
 * Get menu for scanned table (public endpoint)
 * GET /api/v1/scan/menu
 */
export const getMenuForTable = async (req, res, next) => {
  try {
    const { hotelId, branchId, tableNo } = req.query;

    // Validate table exists
    const table = await Table.findByQRData(hotelId, branchId, tableNo);
    if (!table) {
      return next(new APIError(404, "Table not found"));
    }

    // Get menu data
    const menuData = await getMenuData(hotelId, branchId);

    res.status(200).json(
      new APIResponse(
        200,
        {
          table: {
            tableNumber: table.tableNumber,
            capacity: table.capacity,
          },
          hotel: {
            name: table.hotel.name,
          },
          branch: table.branch
            ? {
                name: table.branch.name,
              }
            : null,
          menu: menuData,
        },
        "Menu retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

export default {
  handleQRScan,
  validateQRScan,
  getTableInfo,
  recordScanEvent,
  getMenuForTable,
};
