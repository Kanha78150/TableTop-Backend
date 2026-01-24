import express from "express";
import {
  unifiedLogin,
  refreshToken,
} from "../../controllers/auth/unifiedAuth.controller.js";

const router = express.Router();

/**
 * @route POST /api/v1/auth/login
 * @desc Unified login endpoint for Admin, Manager, and Staff
 * @access Public
 * @body {string} identifier - Email, employeeId (MGR-YYYY-XXXX), or staffId (STF-XXX-YYYY-XXXX)
 * @body {string} password - User password
 * @returns {object} User data, tokens, and userType
 */
router.post("/login", unifiedLogin);

/**
 * @route POST /api/v1/auth/refresh-token
 * @desc Unified refresh token endpoint for User, Admin, Manager, and Staff
 * @access Public
 * @body {string} refreshToken - Refresh token (optional if sent via cookies)
 * @cookie {string} refreshToken - Refresh token from cookies
 * @returns {object} New access and refresh tokens
 */
router.post("/refresh-token", refreshToken);

export default router;
