// src/routes/user/offer.route.js - User Offer Routes (mixed public/protected)
import express from "express";
import userOfferController from "../../controllers/user/offer.controller.js";
import { authenticateUser } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Public offer routes (no auth required)
router.get("/available/:hotelId", userOfferController.getAvailableOffers);
router.get(
  "/available/:hotelId/:branchId",
  userOfferController.getAvailableOffers
);
router.get("/validate/:code", userOfferController.validateOfferCode);

// Protected offer routes (requires authentication)
router.get(
  "/recommendations/:hotelId",
  authenticateUser,
  userOfferController.getSmartOfferRecommendations
);
router.get(
  "/recommendations/:hotelId/:branchId",
  authenticateUser,
  userOfferController.getSmartOfferRecommendations
);

export default router;
