// src/routes/user.route.js - User Routes (index)
import express from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";

// Sub-route modules
import hotelRoutes from "./user/hotel.route.js";
import menuRoutes from "./user/menu.route.js";
import cartRoutes from "./user/cart.route.js";
import orderRoutes from "./user/order.route.js";
import refundRoutes from "./user/refund.route.js";
import coinRoutes from "./user/coin.route.js";
import offerRoutes from "./user/offer.route.js";
import complaintRoutes from "./user/complaint.route.js";
import reviewRoutes from "./user/review.route.js";

const router = express.Router();

// Public routes (no authentication required)
router.use("/", hotelRoutes);
router.use("/menu", menuRoutes);

// Mixed auth routes (auth handled inside sub-route files)
router.use("/offers", offerRoutes);
router.use("/reviews", reviewRoutes);

// Protected routes (authentication applied at mount level)
router.use("/cart", authenticateUser, cartRoutes);
router.use("/orders", authenticateUser, orderRoutes);
router.use("/refunds", authenticateUser, refundRoutes);
router.use("/coins", authenticateUser, coinRoutes);
router.use("/complaints", authenticateUser, complaintRoutes);

export default router;
