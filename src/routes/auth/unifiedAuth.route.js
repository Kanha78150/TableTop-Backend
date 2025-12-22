import express from "express";
import { unifiedLogin } from "../../controllers/auth/unifiedAuth.controller.js";

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

export default router;
