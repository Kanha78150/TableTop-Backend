import express from "express";
import {
  getCoinSettings,
  createCoinSettings,
  updateCoinSettings,
  getCoinAnalytics,
  makeManualCoinAdjustment,
  getUsersWithCoins,
  getCoinTransactionHistory,
  getCoinSettingsHistory,
  reverseCoinTransaction,
  debugCoinSettings,
} from "../../controllers/admin/coin.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  requireFeature,
} from "../../middleware/subscriptionAuth.middleware.js";

const router = express.Router();

// Get current coin settings
router.get(
  "/settings",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getCoinSettings
);

// Create initial coin settings (First-time setup by admin)
router.post(
  "/settings",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  createCoinSettings
);

// Update coin settings (48-hour restriction applies)
router.put(
  "/settings",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  updateCoinSettings
);

// Debug coin settings (temporary for troubleshooting)
router.get(
  "/debug",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  debugCoinSettings
);

// Get coin settings history
router.get(
  "/settings/history",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getCoinSettingsHistory
);

// Get coin analytics and statistics
router.get(
  "/analytics",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getCoinAnalytics
);

// Make manual coin adjustment for a user
router.post(
  "/adjust",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  makeManualCoinAdjustment
);

// Get users with coin balances
router.get(
  "/users",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getUsersWithCoins
);

// Get detailed coin transaction history
router.get(
  "/transactions",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getCoinTransactionHistory
);

// Reverse/cancel a coin transaction
router.post(
  "/transactions/:transactionId/reverse",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  reverseCoinTransaction
);

export default router;
