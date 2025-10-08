import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { coinService } from "../../services/rewardService.js";
import { coinTransactionValidationSchemas } from "../../models/CoinTransaction.model.js";
import { User } from "../../models/User.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Branch } from "../../models/Branch.model.js";
import Joi from "joi";

/**
 * @desc    Get user's coin balance and statistics
 * @route   GET /api/v1/user/coins/balance
 * @access  Private (User)
 */
export const getCoinBalance = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select(
      "coins totalCoinsEarned totalCoinsUsed lastCoinActivity"
    );

    if (!user) {
      return next(new APIError(404, "User not found"));
    }

    const coinStats = user.getCoinStats();

    // Return basic coin balance without hotel-specific settings
    // Since coin balance is universal, we don't need specific hotel settings here
    res.status(200).json(
      new APIResponse(
        200,
        {
          ...coinStats,
          note: "To see coin value and rules, please check specific hotel's coin info",
        },
        "Coin balance retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's detailed coin information including history and expiring coins
 * @route   GET /api/v1/user/coins/details
 * @access  Private (User)
 */
export const getCoinDetails = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page, limit, type, startDate, endDate } = req.query;

    // Validate query parameters
    const { error } = coinTransactionValidationSchemas.getUserHistory.validate(
      req.query
    );
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    const coinDetails = await coinService.getUserCoinDetails(userId, {
      page,
      limit,
      type,
      startDate,
      endDate,
    });

    res
      .status(200)
      .json(
        new APIResponse(200, coinDetails, "Coin details retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get coin transaction history for user
 * @route   GET /api/v1/user/coins/history
 * @access  Private (User)
 */
export const getCoinHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, type, startDate, endDate } = req.query;

    // Validate query parameters
    const { error } = coinTransactionValidationSchemas.getUserHistory.validate(
      req.query
    );
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    const history = await coinService.getUserCoinDetails(userId, {
      page,
      limit,
      type,
      startDate,
      endDate,
    });

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          history.history,
          "Coin history retrieved successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get coins that will expire soon
 * @route   GET /api/v1/user/coins/expiring
 * @access  Private (User)
 */
export const getExpiringCoins = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { daysAhead = 30 } = req.query;

    // Validate daysAhead parameter
    const daysAheadNum = parseInt(daysAhead);
    if (isNaN(daysAheadNum) || daysAheadNum < 1 || daysAheadNum > 365) {
      return next(new APIError(400, "Days ahead must be between 1 and 365"));
    }

    const coinDetails = await coinService.getUserCoinDetails(userId);
    const expiringCoins = coinDetails.expiringCoins;

    // Filter by specified days ahead
    const filteredExpiringCoins = expiringCoins.filter(
      (coin) => coin.daysToExpiry <= daysAheadNum
    );

    const totalExpiringAmount = filteredExpiringCoins.reduce(
      (sum, coin) => sum + coin.amount,
      0
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          expiringCoins: filteredExpiringCoins,
          totalExpiringAmount,
          daysAhead: daysAheadNum,
        },
        "Expiring coins retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Calculate coin discount for an order
 * @route   POST /api/v1/user/coins/calculate-discount
 * @access  Private (User)
 */
export const calculateCoinDiscount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { coinsToUse, orderValue, hotelId, branchId } = req.body;

    // Validate input
    const schema = Joi.object({
      coinsToUse: Joi.number().integer().min(1).required(),
      orderValue: Joi.number().min(1).required(),
      hotelId: Joi.string().length(24).hex().required(),
      branchId: Joi.string().length(24).hex().optional(),
    });

    const { error } = schema.validate({
      coinsToUse,
      orderValue,
      hotelId,
      branchId,
    });
    if (error) {
      return next(new APIError(400, "Invalid input", error.details));
    }

    // Check user's coin balance
    const user = await User.findById(userId);
    if (!user) {
      return next(new APIError(404, "User not found"));
    }

    if (!user.hasSufficientCoins(coinsToUse)) {
      return next(new APIError(400, "Insufficient coin balance"));
    }

    // Calculate discount
    const discountCalculation = await coinService.applyCoinsToOrder(
      userId,
      coinsToUse,
      orderValue,
      hotelId
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          coinsToUse,
          discount: discountCalculation.discount,
          coinValue: discountCalculation.coinValue,
          finalOrderValue: orderValue - discountCalculation.discount,
          maxCoinsUsable: discountCalculation.maxCoinsUsable,
          userCoinBalance: user.coins,
        },
        "Coin discount calculated successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get maximum coins that can be used for an order
 * @route   GET /api/v1/user/coins/max-usable
 * @access  Private (User)
 */
export const getMaxCoinsUsable = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderValue, hotelId, branchId } = req.query;

    // Validate input
    if (
      !orderValue ||
      isNaN(parseFloat(orderValue)) ||
      parseFloat(orderValue) <= 0
    ) {
      return next(new APIError(400, "Valid order value is required"));
    }

    if (!hotelId) {
      return next(new APIError(400, "Hotel ID is required"));
    }

    // Get admin ID from hotel or branch
    let adminId;
    let contextName;

    if (branchId) {
      // If branchId provided, get admin through branch -> hotel
      const branch = await Branch.findById(branchId)
        .populate("hotel", "createdBy name")
        .select("name hotel");

      if (!branch) {
        return next(new APIError(404, "Branch not found"));
      }

      adminId = branch.hotel.createdBy;
      contextName = `${branch.hotel.name} - ${branch.name}`;
    } else {
      // If only hotelId provided, get admin directly from hotel
      const hotel = await Hotel.findById(hotelId).select("createdBy name");
      if (!hotel) {
        return next(new APIError(404, "Hotel not found"));
      }

      adminId = hotel.createdBy;
      contextName = hotel.name;
    }

    const orderValueNum = parseFloat(orderValue);

    // Get current settings and user balance
    const settings = await coinService.getCoinSettings(adminId);
    const user = await User.findById(userId);

    if (!user) {
      return next(new APIError(404, "User not found"));
    }

    if (!settings) {
      return next(
        new APIError(
          404,
          `Coin system not configured for ${contextName}. Please contact the restaurant to set up their coin system.`
        )
      );
    }

    const maxCoinsUsable = settings.getMaxCoinsUsable(orderValueNum);
    const actualMaxUsable = Math.min(maxCoinsUsable, user.coins || 0);
    const maxDiscount = actualMaxUsable * settings.coinValue;

    res.status(200).json(
      new APIResponse(
        200,
        {
          orderValue: orderValueNum,
          userCoinBalance: user.coins || 0,
          maxCoinsUsable: actualMaxUsable,
          systemMaxCoins: maxCoinsUsable,
          maxDiscount,
          coinValue: settings.coinValue,
          maxUsagePercent: settings.maxCoinUsagePercent,
        },
        "Maximum usable coins calculated successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get coins that would be earned for an order at a specific hotel/branch
 * @route   GET /api/v1/user/coins/calculate-earning?orderValue=100&hotelId=123&branchId=456
 * @access  Private (User)
 */
export const calculateCoinsEarning = async (req, res, next) => {
  try {
    const { orderValue, hotelId, branchId } = req.query;

    // Validate input
    if (
      !orderValue ||
      isNaN(parseFloat(orderValue)) ||
      parseFloat(orderValue) <= 0
    ) {
      return next(new APIError(400, "Valid order value is required"));
    }

    if (!hotelId) {
      return next(new APIError(400, "Hotel ID is required"));
    }

    // Get admin ID from hotel or branch
    let adminId;
    let contextName;

    if (branchId) {
      // If branchId provided, get admin through branch -> hotel
      const branch = await Branch.findById(branchId)
        .populate("hotel", "createdBy name")
        .select("name hotel");

      if (!branch) {
        return next(new APIError(404, "Branch not found"));
      }

      adminId = branch.hotel.createdBy;
      contextName = `${branch.hotel.name} - ${branch.name}`;
    } else {
      // If only hotelId provided, get admin directly from hotel
      const hotel = await Hotel.findById(hotelId).select("createdBy name");
      if (!hotel) {
        return next(new APIError(404, "Hotel not found"));
      }

      adminId = hotel.createdBy;
      contextName = hotel.name;
    }

    const orderValueNum = parseFloat(orderValue);
    const coinsEarned = await coinService.calculateCoinsEarned(
      orderValueNum,
      adminId
    );

    // Get current settings for context
    const settings = await coinService.getCoinSettings(adminId);

    if (!settings) {
      return next(
        new APIError(
          404,
          `Coin system not configured for ${contextName}. Please contact the restaurant to set up their coin system.`
        )
      );
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          orderValue: orderValueNum,
          coinsEarned,
          coinValue: settings.coinValue,
          coinsPerRupee: settings.coinsPerRupee,
          minimumOrderValue: settings.minimumOrderValue,
          maxCoinsPerOrder: settings.maxCoinsPerOrder,
          eligible: coinsEarned > 0,
          coinExpiry:
            settings.coinExpiryDays > 0
              ? `${settings.coinExpiryDays} days`
              : "No expiry",
          context: {
            location: contextName,
            hotelId,
            branchId: branchId || null,
          },
        },
        "Coin earning calculation completed successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get coin system information and rules for a specific hotel/branch
 * @route   GET /api/v1/user/coins/info?hotelId=123&branchId=456
 * @access  Private (User)
 */
export const getCoinSystemInfo = async (req, res, next) => {
  try {
    const { hotelId, branchId } = req.query;

    if (!hotelId) {
      return next(new APIError(400, "Hotel ID is required"));
    }

    // Get admin ID from hotel or branch
    let adminId;
    let contextName;

    if (branchId) {
      // If branchId provided, get admin through branch -> hotel
      const branch = await Branch.findById(branchId)
        .populate("hotel", "createdBy name")
        .select("name hotel");

      if (!branch) {
        return next(new APIError(404, "Branch not found"));
      }

      adminId = branch.hotel.createdBy;
      contextName = `${branch.hotel.name} - ${branch.name}`;
    } else {
      // If only hotelId provided, get admin directly from hotel
      const hotel = await Hotel.findById(hotelId).select("createdBy name");
      if (!hotel) {
        return next(new APIError(404, "Hotel not found"));
      }

      adminId = hotel.createdBy;
      contextName = hotel.name;
    }

    const settings = await coinService.getCoinSettings(adminId);
    if (!settings) {
      return next(
        new APIError(404, "Coin system not configured for this hotel")
      );
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          isActive: settings.isActive,
          minimumOrderValue: settings.minimumOrderValue,
          coinValue: settings.coinValue,
          coinsPerRupee: settings.coinsPerRupee,
          maxCoinsPerOrder: settings.maxCoinsPerOrder,
          maxCoinUsagePercent: settings.maxCoinUsagePercent,
          coinExpiryDays: settings.coinExpiryDays,
          rules: {
            earning: `Earn ${
              settings.coinsPerRupee * 100
            }% of order value as coins (minimum order ₹${
              settings.minimumOrderValue
            })`,
            usage: `Use up to ${settings.maxCoinUsagePercent}% of order value with coins`,
            value: `1 coin = ₹${settings.coinValue}`,
            expiry:
              settings.coinExpiryDays > 0
                ? `Coins expire after ${settings.coinExpiryDays} days`
                : "Coins never expire",
          },
        },
        "Coin system information retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

export default {
  getCoinBalance,
  getCoinDetails,
  getCoinHistory,
  getExpiringCoins,
  calculateCoinDiscount,
  getMaxCoinsUsable,
  calculateCoinsEarning,
  getCoinSystemInfo,
};
