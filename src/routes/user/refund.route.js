// src/routes/user/refund.route.js - User Refund Routes
// Note: authenticateUser is applied at the mount level in user.route.js
import express from "express";
import { getUserRefunds } from "../../controllers/user/refundStatus.controller.js";

const router = express.Router();

// Get all user's refunds
router.get("/", getUserRefunds);

export default router;
