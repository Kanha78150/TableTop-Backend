// src/routes/user/coin.route.js - User Coin System Routes
// Note: authenticateUser is applied at the mount level in user.route.js
import express from "express";
import {
  getCoinBalance,
  getCoinDetails,
  getCoinHistory,
  getExpiringCoins,
  calculateCoinDiscount,
  getMaxCoinsUsable,
  calculateCoinsEarning,
  getCoinSystemInfo,
} from "../../controllers/user/coin.controller.js";

const router = express.Router();

router.get("/balance", getCoinBalance);
router.get("/details", getCoinDetails);
router.get("/history", getCoinHistory);
router.get("/expiring", getExpiringCoins);
router.post("/calculate-discount", calculateCoinDiscount);
router.get("/max-usable", getMaxCoinsUsable);
router.get("/calculate-earning", calculateCoinsEarning);
router.get("/info", getCoinSystemInfo);

export default router;
