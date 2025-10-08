import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { coinService } from "../../services/rewardService.js";
import { coinTransactionValidationSchemas } from "../../models/CoinTransaction.model.js";
import { User } from "../../models/User.model.js";
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

    // Get current coin settings for context
    const settings = await coinService.getCoinSettings();

    res.status(200).json(
      new APIResponse(
        200,
        {
          ...coinStats,
          coinValue: settings.coinValue, // Value of each coin in currency
          systemActive: settings.isActive,
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
    const { coinsToUse, orderValue } = req.body;

    // Validate input
    const schema = Joi.object({
      coinsToUse: Joi.number().integer().min(1).required(),
      orderValue: Joi.number().min(1).required(),
    });

    const { error } = schema.validate({ coinsToUse, orderValue });
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
      orderValue
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
    const { orderValue } = req.query;

    // Validate input
    if (
      !orderValue ||
      isNaN(parseFloat(orderValue)) ||
      parseFloat(orderValue) <= 0
    ) {
      return next(new APIError(400, "Valid order value is required"));
    }

    const orderValueNum = parseFloat(orderValue);

    // Get current settings and user balance
    const settings = await coinService.getCoinSettings();
    const user = await User.findById(userId);

    if (!user) {
      return next(new APIError(404, "User not found"));
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
 * @desc    Get coins that would be earned for an order
 * @route   GET /api/v1/user/coins/calculate-earning
 * @access  Private (User)
 */
export const calculateCoinsEarning = async (req, res, next) => {
  try {
    const { orderValue } = req.query;

    // Validate input
    if (
      !orderValue ||
      isNaN(parseFloat(orderValue)) ||
      parseFloat(orderValue) <= 0
    ) {
      return next(new APIError(400, "Valid order value is required"));
    }

    const orderValueNum = parseFloat(orderValue);
    const coinsEarned = await coinService.calculateCoinsEarned(orderValueNum);

    // Get current settings for context
    const settings = await coinService.getCoinSettings();

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
        },
        "Coin earning calculation completed successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get coin system information and rules
 * @route   GET /api/v1/user/coins/info
 * @access  Private (User)
 */
export const getCoinSystemInfo = async (req, res, next) => {
  try {
    const settings = await coinService.getCoinSettings();

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
