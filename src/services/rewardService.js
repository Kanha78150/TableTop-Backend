import { CoinSettings } from "../models/CoinSettings.model.js";
import { CoinTransaction } from "../models/CoinTransaction.model.js";
import { User } from "../models/User.model.js";
import { Order } from "../models/Order.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";

class CoinService {
  /**
   * Get current coin settings for specific admin (ISOLATED)
   * @param {string} adminId - Admin ID to get settings for
   * @returns {Object|null} Current coin settings or null if not configured
   */
  async getCoinSettings(adminId) {
    try {
      if (!adminId) {
        throw new APIError(
          400,
          "Admin ID is required for isolated coin settings"
        );
      }
      return await CoinSettings.getCurrentSettings(adminId);
    } catch (error) {
      logger.error("Error fetching coin settings:", error);
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Failed to fetch coin settings");
    }
  }

  /**
   * Create initial coin settings for specific admin (ISOLATED)
   * @param {Object} settingsData - Initial settings data
   * @param {string} adminId - Admin ID who is creating the settings
   * @returns {Object} Created settings
   */
  async createInitialCoinSettings(settingsData, adminId) {
    try {
      if (!adminId) {
        throw new APIError(
          400,
          "Admin ID is required for isolated coin settings"
        );
      }

      // Check if this admin already has settings
      const existingSettings = await CoinSettings.getCurrentSettings(adminId);
      if (existingSettings) {
        throw new APIError(
          400,
          "This admin already has coin settings configured"
        );
      }

      return await CoinSettings.createInitialSettings(settingsData, adminId);
    } catch (error) {
      logger.error("Error creating initial coin settings:", error);
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Failed to create coin settings");
    }
  }

  /**
   * Calculate coins earned for an order (ISOLATED by admin)
   * @param {number} orderValue - Total order value
   * @param {string} adminId - Admin ID whose settings to use
   * @returns {number} Coins to be earned
   */
  async calculateCoinsEarned(orderValue, adminId) {
    try {
      if (!adminId) {
        logger.warn("No admin context - no coins awarded");
        return 0;
      }

      const settings = await CoinSettings.getSettingsForOrder(adminId);
      if (!settings) {
        logger.warn(
          `Admin ${adminId} coin settings not configured - no coins awarded`
        );
        return 0;
      }
      return settings.calculateCoinsEarned(orderValue);
    } catch (error) {
      logger.error("Error calculating coins earned:", error);
      return 0;
    }
  }

  /**
   * Award coins to user for a successful order
   * @param {string} userId - User ID
   * @param {string} orderId - Order ID
   * @param {number} orderValue - Order value
   * @returns {Object} Transaction details
   */
  async awardCoinsForOrder(userId, orderId, orderValue) {
    try {
      const settings = await this.getCoinSettings();
      if (!settings) {
        logger.warn(
          "Coin settings not configured - no coins awarded for order:",
          orderId
        );
        return { coinsEarned: 0, transaction: null };
      }

      const coinsEarned = settings.calculateCoinsEarned(orderValue);

      if (coinsEarned <= 0) {
        return { coinsEarned: 0, transaction: null };
      }

      // Set expiry date if coins have expiry
      let expiresAt = null;
      if (settings.coinExpiryDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + settings.coinExpiryDays);
      }

      // Create coin transaction
      const transaction = await CoinTransaction.createTransaction({
        userId,
        type: "earned",
        amount: coinsEarned,
        orderId,
        description: `Coins earned from order (₹${orderValue})`,
        metadata: {
          orderValue,
          coinsRate: settings.coinsPerRupee,
          coinValue: settings.coinValue,
        },
        expiresAt,
      });

      logger.info(
        `Awarded ${coinsEarned} coins to user ${userId} for order ${orderId}`
      );

      return { coinsEarned, transaction };
    } catch (error) {
      logger.error("Error awarding coins for order:", error);
      throw new APIError(500, "Failed to award coins", error.message);
    }
  }

  /**
   * Apply coins to an order payment
   * @param {string} userId - User ID
   * @param {number} coinsToUse - Number of coins to use
   * @param {number} orderValue - Total order value
   * @param {string} hotelId - Hotel ID to get admin-specific settings
   * @returns {Object} Application details
   */
  async applyCoinsToOrder(userId, coinsToUse, orderValue, hotelId) {
    try {
      if (coinsToUse <= 0) {
        return { discount: 0, coinsUsed: 0, transaction: null };
      }

      // Get hotel to find the admin
      const hotel = await Hotel.findById(hotelId).select("createdBy");
      if (!hotel) {
        throw new APIError(404, "Hotel not found");
      }

      const settings = await this.getCoinSettings(hotel.createdBy);
      const user = await User.findById(userId);

      if (!user) {
        throw new APIError(404, "User not found");
      }

      // Check if user has sufficient coins
      if (!user.hasSufficientCoins(coinsToUse)) {
        throw new APIError(400, "Insufficient coin balance");
      }

      // Check maximum coin usage limit
      const maxCoinsUsable = settings.getMaxCoinsUsable(orderValue);
      if (coinsToUse > maxCoinsUsable) {
        throw new APIError(
          400,
          `Can only use maximum ${maxCoinsUsable} coins for this order`
        );
      }

      // Calculate discount amount
      const discount = coinsToUse * settings.coinValue;

      return {
        discount,
        coinsUsed: coinsToUse,
        coinValue: settings.coinValue,
        maxCoinsUsable,
      };
    } catch (error) {
      logger.error("Error applying coins to order:", error);
      throw error instanceof APIError
        ? error
        : new APIError(500, "Failed to apply coins");
    }
  }

  /**
   * Process coin usage for order payment
   * @param {string} userId - User ID
   * @param {string} orderId - Order ID
   * @param {number} coinsToUse - Coins to use
   * @param {number} orderValue - Order value
   * @returns {Object} Transaction details
   */
  async processCoinsUsage(userId, orderId, coinsToUse, orderValue) {
    try {
      const { discount, coinValue } = await this.applyCoinsToOrder(
        userId,
        coinsToUse,
        orderValue
      );

      if (coinsToUse <= 0) {
        return { discount: 0, transaction: null };
      }

      // Create deduction transaction
      const transaction = await CoinTransaction.createTransaction({
        userId,
        type: "used",
        amount: -coinsToUse,
        orderId,
        description: `Coins used for order payment (₹${discount} discount)`,
        metadata: {
          orderValue,
          discount,
          coinValue,
        },
      });

      logger.info(
        `Deducted ${coinsToUse} coins from user ${userId} for order ${orderId}`
      );

      return { discount, transaction };
    } catch (error) {
      logger.error("Error processing coins usage:", error);
      throw error instanceof APIError
        ? error
        : new APIError(500, "Failed to process coins usage");
    }
  }

  /**
   * Handle coin refund for order cancellation
   * @param {string} userId - User ID
   * @param {string} orderId - Order ID
   * @param {string} refundRequestId - Refund request ID (optional)
   * @returns {Object} Refund details
   */
  async handleCoinRefund(userId, orderId, refundRequestId = null) {
    try {
      // Find all coin transactions for this order
      const earnedTransactions = await CoinTransaction.find({
        user: userId,
        order: orderId,
        type: "earned",
        status: "completed",
      });

      const usedTransactions = await CoinTransaction.find({
        user: userId,
        order: orderId,
        type: "used",
        status: "completed",
      });

      let totalRefunded = 0;
      const refundTransactions = [];

      // Refund used coins (give back coins that were used)
      for (const usedTransaction of usedTransactions) {
        const coinsToRefund = Math.abs(usedTransaction.amount);

        const refundTransaction = await CoinTransaction.createTransaction({
          userId,
          type: "refunded",
          amount: coinsToRefund,
          orderId,
          refundRequestId,
          description: `Coins refunded for order cancellation`,
          metadata: {
            originalTransactionId: usedTransaction._id,
            refundReason: "Order cancelled/refunded",
          },
        });

        refundTransactions.push(refundTransaction);
        totalRefunded += coinsToRefund;
      }

      // Deduct earned coins (remove coins that were earned from this order)
      for (const earnedTransaction of earnedTransactions) {
        const coinsToDeduct = earnedTransaction.amount;

        const deductionTransaction = await CoinTransaction.createTransaction({
          userId,
          type: "refunded",
          amount: -coinsToDeduct,
          orderId,
          refundRequestId,
          description: `Coins deducted due to order cancellation`,
          metadata: {
            originalTransactionId: earnedTransaction._id,
            deductionReason: "Order cancelled/refunded",
          },
        });

        refundTransactions.push(deductionTransaction);
        totalRefunded -= coinsToDeduct;
      }

      logger.info(
        `Processed coin refund for order ${orderId}. Net refund: ${totalRefunded} coins`
      );

      return {
        netRefund: totalRefunded,
        earnedCoinsDeducted: earnedTransactions.reduce(
          (sum, tx) => sum + tx.amount,
          0
        ),
        usedCoinsRefunded: usedTransactions.reduce(
          (sum, tx) => sum + Math.abs(tx.amount),
          0
        ),
        transactions: refundTransactions,
      };
    } catch (error) {
      logger.error("Error handling coin refund:", error);
      throw new APIError(500, "Failed to process coin refund", error.message);
    }
  }

  /**
   * Get user's coin balance and history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} Coin details
   */
  async getUserCoinDetails(userId, options = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new APIError(404, "User not found");
      }

      const coinStats = user.getCoinStats();
      const history = await CoinTransaction.getUserCoinHistory(userId, options);
      const expiringCoins = await CoinTransaction.getExpiringCoins(userId, 30);

      return {
        balance: coinStats,
        history,
        expiringCoins: expiringCoins.map((coin) => ({
          amount: coin.amount,
          expiresAt: coin.expiresAt,
          earnedAt: coin.createdAt,
          daysToExpiry: Math.ceil(
            (coin.expiresAt - new Date()) / (1000 * 60 * 60 * 24)
          ),
        })),
      };
    } catch (error) {
      logger.error("Error fetching user coin details:", error);
      throw error instanceof APIError
        ? error
        : new APIError(500, "Failed to fetch coin details");
    }
  }

  /**
   * Admin: Update coin settings
   * @param {Object} newSettings - New settings
   * @param {string} adminId - Admin ID
   * @param {string} reason - Reason for update
   * @returns {Object} Updated settings
   */
  async updateCoinSettings(newSettings, adminId, reason = "") {
    try {
      const settings = await this.getCoinSettings(adminId);

      // Check if update is allowed (48-hour rule)
      if (!settings.canUpdate()) {
        const nextUpdateTime = new Date(
          settings.lastUpdatedAt.getTime() + 48 * 60 * 60 * 1000
        );
        throw new APIError(
          400,
          `Your coin settings can only be updated after 48 hours. Next update allowed at: ${nextUpdateTime.toLocaleString()}`
        );
      }

      await settings.updateSettings(newSettings, adminId, reason);

      logger.info(`Coin settings updated by admin ${adminId}`, {
        newSettings,
        reason,
      });

      return settings;
    } catch (error) {
      logger.error("Error updating coin settings:", error);
      throw error instanceof APIError
        ? error
        : new APIError(500, "Failed to update coin settings");
    }
  }

  /**
   * Admin: Make manual coin adjustment
   * @param {string} userId - User ID
   * @param {number} amount - Amount to adjust (positive/negative)
   * @param {string} reason - Reason for adjustment
   * @param {string} adminId - Admin ID
   * @returns {Object} Transaction details
   */
  async makeManualAdjustment(userId, amount, reason, adminId) {
    try {
      if (amount === 0) {
        throw new APIError(400, "Adjustment amount cannot be zero");
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new APIError(404, "User not found");
      }

      // Check if deduction would result in negative balance
      if (amount < 0 && !user.hasSufficientCoins(Math.abs(amount))) {
        throw new APIError(400, "Adjustment would result in negative balance");
      }

      const transaction = await CoinTransaction.createTransaction({
        userId,
        type: "adjusted",
        amount,
        description: `Manual adjustment by admin: ${reason}`,
        adjustedBy: adminId,
        metadata: {
          adminReason: reason,
          adjustmentType: amount > 0 ? "bonus" : "penalty",
        },
      });

      logger.info(
        `Manual coin adjustment: ${amount} coins ${
          amount > 0 ? "added to" : "deducted from"
        } user ${userId} by admin ${adminId}`
      );

      return transaction;
    } catch (error) {
      logger.error("Error making manual coin adjustment:", error);
      throw error instanceof APIError
        ? error
        : new APIError(500, "Failed to make coin adjustment");
    }
  }

  /**
   * Get coin analytics for admin (ISOLATED)
   * @param {string} adminId - Admin ID
   * @param {Object} filters - Analytics filters
   * @returns {Object} Analytics data
   */
  async getCoinAnalytics(adminId, filters = {}) {
    try {
      const { startDate, endDate } = filters;

      // Get hotels owned by this admin
      const adminHotels = await Hotel.find({ createdBy: adminId }).select(
        "_id"
      );
      const hotelIds = adminHotels.map((hotel) => hotel._id);

      if (hotelIds.length === 0) {
        return {
          totalCoinsInCirculation: 0,
          transactionStats: [],
          dailyTrends: [],
          topUsers: [],
        };
      }

      const matchConditions = {
        hotel: { $in: hotelIds },
      };

      if (startDate || endDate) {
        matchConditions.createdAt = {};
        if (startDate) matchConditions.createdAt.$gte = new Date(startDate);
        if (endDate) matchConditions.createdAt.$lte = new Date(endDate);
      }

      // Total coins in circulation for this admin's hotels
      const totalCoinsInCirculation = await User.aggregate([
        {
          $lookup: {
            from: "cointransactions",
            localField: "_id",
            foreignField: "user",
            as: "transactions",
          },
        },
        {
          $match: {
            "transactions.hotel": { $in: hotelIds },
          },
        },
        {
          $group: {
            _id: null,
            totalCoins: { $sum: "$coins" },
          },
        },
      ]);

      // Transaction analytics
      const transactionStats = await CoinTransaction.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);

      // Daily transaction trends
      const dailyTrends = await CoinTransaction.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: {
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              type: "$type",
            },
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.date": 1 } },
      ]);

      // Top users by coin activity
      const topUsers = await CoinTransaction.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: "$user",
            totalTransactions: { $sum: 1 },
            totalEarned: {
              $sum: { $cond: [{ $eq: ["$type", "earned"] }, "$amount", 0] },
            },
            totalUsed: {
              $sum: {
                $cond: [{ $eq: ["$type", "used"] }, { $abs: "$amount" }, 0],
              },
            },
          },
        },
        { $sort: { totalEarned: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "userDetails",
          },
        },
      ]);

      return {
        totalCoinsInCirculation: totalCoinsInCirculation[0]?.totalCoins || 0,
        transactionStats,
        dailyTrends,
        topUsers,
      };
    } catch (error) {
      logger.error("Error fetching coin analytics:", error);
      throw new APIError(500, "Failed to fetch coin analytics");
    }
  }

  /**
   * Process expired coins (scheduled job)
   * @returns {number} Number of expired coin records processed
   */
  async processExpiredCoins() {
    try {
      const expiredCount = await CoinTransaction.expireCoins();

      if (expiredCount > 0) {
        logger.info(`Processed ${expiredCount} expired coin records`);
      }

      return expiredCount;
    } catch (error) {
      logger.error("Error processing expired coins:", error);
      throw new APIError(500, "Failed to process expired coins");
    }
  }
}

export const coinService = new CoinService();
export default coinService;
