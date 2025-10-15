import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { coinService } from "../../services/rewardService.js";
import {
  CoinSettings,
  coinSettingsValidationSchemas,
} from "../../models/CoinSettings.model.js";
import { CoinTransaction } from "../../models/CoinTransaction.model.js";
import { User } from "../../models/User.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import Joi from "joi";

/**
 * @desc    Get current coin settings for logged-in admin (ISOLATED)
 * @route   GET /api/v1/admin/coins/settings
 * @access  Private (Admin)
 */
export const getCoinSettings = async (req, res, next) => {
  try {
    const adminId = req.admin._id; // Get admin ID from authentication middleware
    const settings = await coinService.getCoinSettings(adminId);

    if (!settings) {
      return res
        .status(200)
        .json(
          new APIResponse(
            200,
            null,
            "No coin settings configured for your account. Please configure the coin system first."
          )
        );
    }

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          settings,
          "Your coin settings retrieved successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create initial coin settings for logged-in admin (ISOLATED)
 * @route   POST /api/v1/admin/coins/settings
 * @access  Private (Admin)
 */
export const createCoinSettings = async (req, res, next) => {
  try {
    const adminId = req.admin._id;

    // Check if this admin already has settings
    const existingSettings = await coinService.getCoinSettings(adminId);
    if (existingSettings) {
      return next(
        new APIError(
          400,
          "You already have coin settings configured. Use PUT to update."
        )
      );
    }

    // Validate request body for initial creation
    const { error } = coinSettingsValidationSchemas.create.validate(req.body);
    if (error) {
      return next(new APIError(400, "Invalid input", error.details));
    }

    const settingsData = req.body;

    const newSettings = await coinService.createInitialCoinSettings(
      settingsData,
      adminId
    );

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          newSettings,
          "Coin settings configured successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update coin settings
 * @route   PUT /api/v1/admin/coins/settings
 * @access  Private (Admin)
 */
export const updateCoinSettings = async (req, res, next) => {
  try {
    const adminId = req.admin._id;

    // Check if this admin has settings
    const existingSettings = await coinService.getCoinSettings(adminId);
    if (!existingSettings) {
      return next(
        new APIError(
          404,
          "No coin settings found for your account. Please create initial settings first."
        )
      );
    }

    // Validate request body
    const { error } = coinSettingsValidationSchemas.update.validate(req.body);
    if (error) {
      return next(new APIError(400, "Invalid input", error.details));
    }

    const {
      minimumOrderValue,
      coinValue,
      coinsPerRupee,
      maxCoinsPerOrder,
      maxCoinUsagePercent,
      coinExpiryDays,
      isActive,
      reason = "",
    } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    if (minimumOrderValue !== undefined)
      updateData.minimumOrderValue = minimumOrderValue;
    if (coinValue !== undefined) updateData.coinValue = coinValue;
    if (coinsPerRupee !== undefined) updateData.coinsPerRupee = coinsPerRupee;
    if (maxCoinsPerOrder !== undefined)
      updateData.maxCoinsPerOrder = maxCoinsPerOrder;
    if (maxCoinUsagePercent !== undefined)
      updateData.maxCoinUsagePercent = maxCoinUsagePercent;
    if (coinExpiryDays !== undefined)
      updateData.coinExpiryDays = coinExpiryDays;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedSettings = await coinService.updateCoinSettings(
      updateData,
      adminId,
      reason
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          updatedSettings,
          "Coin settings updated successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get coin analytics
 * @route   GET /api/v1/admin/coins/analytics
 * @access  Private (Admin)
 */
export const getCoinAnalytics = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const { startDate, endDate } = req.query;

    // Validate date parameters
    if (startDate && isNaN(Date.parse(startDate))) {
      return next(new APIError(400, "Invalid start date format"));
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return next(new APIError(400, "Invalid end date format"));
    }

    const analytics = await coinService.getCoinAnalytics(adminId, {
      startDate,
      endDate,
    });

    res
      .status(200)
      .json(
        new APIResponse(200, analytics, "Coin analytics retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Make manual coin adjustment for a user
 * @route   POST /api/v1/admin/coins/adjust
 * @access  Private (Admin)
 */
export const makeManualCoinAdjustment = async (req, res, next) => {
  try {
    // Validate request body
    const schema = Joi.object({
      userId: Joi.string().hex().length(24).required(),
      amount: Joi.number().integer().not(0).required(),
      reason: Joi.string().min(5).max(200).required(),
    });

    const { error } = schema.validate(req.body);
    if (error) {
      return next(new APIError(400, "Invalid input", error.details));
    }

    const { userId, amount, reason } = req.body;
    const adminId = req.admin._id;

    const transaction = await coinService.makeManualAdjustment(
      userId,
      amount,
      reason,
      adminId
    );

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          transaction,
          `Coin adjustment completed: ${
            amount > 0 ? "added" : "deducted"
          } ${Math.abs(amount)} coins`
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all users with coin balances (filtered by admin's hotels)
 * @route   GET /api/v1/admin/coins/users
 * @access  Private (Admin)
 */
export const getUsersWithCoins = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const {
      page = 1,
      limit = 20,
      minBalance = 0,
      search = "",
      sortBy = "coins",
      sortOrder = "desc",
    } = req.query;

    // Get hotels owned by this admin
    const adminHotels = await Hotel.find({ createdBy: adminId }).select("_id");
    const hotelIds = adminHotels.map((hotel) => hotel._id);

    if (hotelIds.length === 0) {
      return res.status(200).json(
        new APIResponse(
          200,
          {
            users: [],
            pagination: {
              currentPage: parseInt(page),
              totalPages: 0,
              totalUsers: 0,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
          "No hotels found for your account"
        )
      );
    }

    // Find users who have had coin transactions in this admin's hotels
    const usersWithTransactions = await CoinTransaction.distinct("user", {
      hotel: { $in: hotelIds },
    });

    // Build query for users with coin transactions in admin's hotels
    const query = {
      _id: { $in: usersWithTransactions },
      coins: { $gte: parseInt(minBalance) },
    };

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const users = await User.find(query)
      .select(
        "name email phone coins totalCoinsEarned totalCoinsUsed lastCoinActivity createdAt"
      )
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalUsers = await User.countDocuments(query);

    // Calculate additional stats for each user (only for this admin's hotels)
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const userObj = user.toObject();

        // Get recent transaction count for this admin's hotels only
        const recentTransactionCount = await CoinTransaction.countDocuments({
          user: user._id,
          hotel: { $in: hotelIds },
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        });

        // Calculate coin efficiency based on transactions in this admin's hotels
        const userEarned = await CoinTransaction.aggregate([
          {
            $match: {
              user: user._id,
              hotel: { $in: hotelIds },
              type: "earned",
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]);

        const userUsed = await CoinTransaction.aggregate([
          {
            $match: {
              user: user._id,
              hotel: { $in: hotelIds },
              type: "used",
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $abs: "$amount" } },
            },
          },
        ]);

        const totalEarned = userEarned[0]?.total || 0;
        const totalUsed = userUsed[0]?.total || 0;

        return {
          ...userObj,
          recentTransactionCount,
          coinEfficiency:
            totalEarned > 0 ? ((totalUsed / totalEarned) * 100).toFixed(2) : 0,
        };
      })
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          users: usersWithStats,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalUsers / parseInt(limit)),
            totalUsers,
            hasNextPage: page < Math.ceil(totalUsers / parseInt(limit)),
            hasPrevPage: page > 1,
          },
        },
        "Users with coin balances retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get detailed coin transaction history (filtered by admin's hotels)
 * @route   GET /api/v1/admin/coins/transactions
 * @access  Private (Admin)
 */
export const getCoinTransactionHistory = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const {
      page = 1,
      limit = 20,
      userId,
      type,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Get hotels owned by this admin
    const adminHotels = await Hotel.find({ createdBy: adminId }).select("_id");
    const hotelIds = adminHotels.map((hotel) => hotel._id);

    if (hotelIds.length === 0) {
      return res.status(200).json(
        new APIResponse(
          200,
          {
            transactions: [],
            pagination: {
              currentPage: parseInt(page),
              totalPages: 0,
              totalTransactions: 0,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
          "No hotels found for your account"
        )
      );
    }

    // Build query - filter by admin's hotels
    const query = {
      hotel: { $in: hotelIds },
    };

    if (userId) {
      // Validate userId format
      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        return next(new APIError(400, "Invalid user ID format"));
      }
      query.user = userId;
    }

    if (type) {
      const validTypes = ["earned", "used", "refunded", "expired", "adjusted"];
      if (!validTypes.includes(type)) {
        return next(new APIError(400, "Invalid transaction type"));
      }
      query.type = type;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        if (isNaN(Date.parse(startDate))) {
          return next(new APIError(400, "Invalid start date format"));
        }
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        if (isNaN(Date.parse(endDate))) {
          return next(new APIError(400, "Invalid end date format"));
        }
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const transactions = await CoinTransaction.find(query)
      .populate("user", "name email phone")
      .populate("order", "orderNumber totalPrice createdAt")
      .populate("adjustedBy", "name email")
      .populate("hotel", "name")
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalTransactions = await CoinTransaction.countDocuments(query);

    res.status(200).json(
      new APIResponse(
        200,
        {
          transactions,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalTransactions / parseInt(limit)),
            totalTransactions,
            hasNextPage: page < Math.ceil(totalTransactions / parseInt(limit)),
            hasPrevPage: page > 1,
          },
        },
        "Coin transaction history retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get coin settings history
 * @route   GET /api/v1/admin/coins/settings/history
 * @access  Private (Admin)
 */
export const getCoinSettingsHistory = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const settings = await coinService.getCoinSettings(adminId);

    if (!settings) {
      return next(
        new APIError(
          404,
          "No coin settings found. Please create initial settings first."
        )
      );
    }

    // Sort history by most recent first
    const sortedHistory = settings.history.sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          currentSettings: {
            minimumOrderValue: settings.minimumOrderValue,
            coinValue: settings.coinValue,
            coinsPerRupee: settings.coinsPerRupee,
            maxCoinsPerOrder: settings.maxCoinsPerOrder,
            maxCoinUsagePercent: settings.maxCoinUsagePercent,
            coinExpiryDays: settings.coinExpiryDays,
            isActive: settings.isActive,
            lastUpdatedAt: settings.lastUpdatedAt,
            canUpdate: settings.canUpdate(),
          },
          history: sortedHistory,
        },
        "Coin settings history retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reverse/cancel a coin transaction (only from admin's hotels)
 * @route   POST /api/v1/admin/coins/transactions/:transactionId/reverse
 * @access  Private (Admin)
 */
export const reverseCoinTransaction = async (req, res, next) => {
  try {
    const adminId = req.admin._id;
    const { transactionId } = req.params;
    const { reason } = req.body;

    // Validate input
    if (!transactionId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid transaction ID format"));
    }

    if (!reason || reason.trim().length < 5) {
      return next(
        new APIError(400, "Reversal reason is required (minimum 5 characters)")
      );
    }

    // Get hotels owned by this admin
    const adminHotels = await Hotel.find({ createdBy: adminId }).select("_id");
    const hotelIds = adminHotels.map((hotel) => hotel._id);

    if (hotelIds.length === 0) {
      return next(new APIError(403, "No hotels found for your account"));
    }

    // Find the transaction and ensure it's from admin's hotel
    const transaction = await CoinTransaction.findOne({
      _id: transactionId,
      hotel: { $in: hotelIds },
    });

    if (!transaction) {
      return next(new APIError(404, "Transaction not found or not accessible"));
    }

    if (transaction.status !== "completed") {
      return next(
        new APIError(400, "Only completed transactions can be reversed")
      );
    }

    // Reverse the transaction
    const reversalTransaction = await transaction.reverse(reason.trim());

    res.status(200).json(
      new APIResponse(
        200,
        {
          originalTransaction: transaction,
          reversalTransaction,
        },
        "Transaction reversed successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Debug: Check coin settings directly from database
 * @route   GET /api/v1/admin/coins/debug
 * @access  Private (Admin)
 */
export const debugCoinSettings = async (req, res, next) => {
  try {
    const adminId = req.admin._id;

    // Check raw database query
    const rawSettings = await CoinSettings.findOne({ adminId });

    // Check using the service method
    const serviceSettings = await coinService.getCoinSettings(adminId);

    // Count total settings for this admin
    const count = await CoinSettings.countDocuments({ adminId });

    res.status(200).json(
      new APIResponse(
        200,
        {
          adminId,
          rawSettings,
          serviceSettings,
          settingsCount: count,
          message: "Check server console for debug info",
        },
        "Debug info retrieved"
      )
    );
  } catch (error) {
    console.error("Debug error:", error);
    next(error);
  }
};

export default {
  getCoinSettings,
  createCoinSettings,
  updateCoinSettings,
  getCoinAnalytics,
  debugCoinSettings,
  makeManualCoinAdjustment,
  getUsersWithCoins,
  getCoinTransactionHistory,
  getCoinSettingsHistory,
  reverseCoinTransaction,
};
