import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { coinService } from "../../services/rewardService.js";
import { coinSettingsValidationSchemas } from "../../models/CoinSettings.model.js";
import { CoinTransaction } from "../../models/CoinTransaction.model.js";
import { User } from "../../models/User.model.js";
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
    const { startDate, endDate } = req.query;

    // Validate date parameters
    if (startDate && isNaN(Date.parse(startDate))) {
      return next(new APIError(400, "Invalid start date format"));
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return next(new APIError(400, "Invalid end date format"));
    }

    const analytics = await coinService.getCoinAnalytics({
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
 * @desc    Get all users with coin balances
 * @route   GET /api/v1/admin/coins/users
 * @access  Private (Admin)
 */
export const getUsersWithCoins = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      minBalance = 0,
      search = "",
      sortBy = "coins",
      sortOrder = "desc",
    } = req.query;

    // Build query
    const query = { coins: { $gte: parseInt(minBalance) } };

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

    // Calculate additional stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const userObj = user.toObject();

        // Get recent transaction count
        const recentTransactionCount = await CoinTransaction.countDocuments({
          user: user._id,
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        });

        return {
          ...userObj,
          recentTransactionCount,
          coinEfficiency:
            userObj.totalCoinsUsed > 0
              ? (
                  (userObj.totalCoinsUsed / userObj.totalCoinsEarned) *
                  100
                ).toFixed(2)
              : 0,
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
 * @desc    Get detailed coin transaction history
 * @route   GET /api/v1/admin/coins/transactions
 * @access  Private (Admin)
 */
export const getCoinTransactionHistory = async (req, res, next) => {
  try {
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

    // Build query
    const query = {};

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
    const settings = await coinService.getCoinSettings();

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
 * @desc    Reverse/cancel a coin transaction
 * @route   POST /api/v1/admin/coins/transactions/:transactionId/reverse
 * @access  Private (Admin)
 */
export const reverseCoinTransaction = async (req, res, next) => {
  try {
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

    // Find the transaction
    const transaction = await CoinTransaction.findById(transactionId);
    if (!transaction) {
      return next(new APIError(404, "Transaction not found"));
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

export default {
  getCoinSettings,
  createCoinSettings,
  updateCoinSettings,
  getCoinAnalytics,
  makeManualCoinAdjustment,
  getUsersWithCoins,
  getCoinTransactionHistory,
  getCoinSettingsHistory,
  reverseCoinTransaction,
};
