import express from "express";
import {
  getDashboardOverview,
  getAllAdminsWithDetails,
  getAdminCompleteDetails,
  getAllHotelsWithAdmins,
  getAllBranchesWithDetails,
  getAllManagersWithDetails,
  getAllStaffWithDetails,
  getHotelIncomeReport,
  getBranchwiseIncome,
  getRevenueAnalytics,
  getSystemStatistics,
} from "../../controllers/superAdmin/dashboard.controller.js";
import {
  authenticateAdmin,
  requireSuperAdmin,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Apply authentication and super admin authorization to all routes
router.use(authenticateAdmin, requireSuperAdmin);

/**
 * @route   GET /api/v1/super-admin/dashboard
 * @desc    Get dashboard overview with system-wide statistics
 * @access  Private (Super Admin)
 * @returns { overview, recentAdmins, expiringSubscriptions }
 */
router.get("/dashboard", getDashboardOverview);

/**
 * @route   GET /api/v1/super-admin/admins
 * @desc    Get all admins with subscription and resource details
 * @access  Private (Super Admin)
 * @query   { page, limit, search, status, subscriptionStatus, sortBy, sortOrder }
 * @returns { admins[], pagination }
 */
router.get("/admins", getAllAdminsWithDetails);

/**
 * @route   GET /api/v1/super-admin/admins/:adminId
 * @desc    Get complete details of a specific admin
 * @access  Private (Super Admin)
 * @params  { adminId }
 * @returns { admin, hotels[], branches[], managers[], staff[], financials, summary }
 */
router.get("/admins/:adminId", getAdminCompleteDetails);

/**
 * @route   GET /api/v1/super-admin/hotels
 * @desc    Get all hotels with admin and branch information
 * @access  Private (Super Admin)
 * @query   { page, limit, search, status, sortBy, sortOrder }
 * @returns { hotels[], pagination }
 */
router.get("/hotels", getAllHotelsWithAdmins);

/**
 * @route   GET /api/v1/super-admin/hotels/:hotelId/income
 * @desc    Get hotel income report by period (daily/monthly/yearly)
 * @access  Private (Super Admin)
 * @params  { hotelId }
 * @query   { period, year, month }
 * @returns { hotel, period, incomeData[], statistics }
 */
router.get("/hotels/:hotelId/income", getHotelIncomeReport);

/**
 * @route   GET /api/v1/super-admin/hotels/:hotelId/branch-income
 * @desc    Get branch-wise income breakdown for a hotel
 * @access  Private (Super Admin)
 * @params  { hotelId }
 * @query   { startDate, endDate }
 * @returns { hotel, branches[], summary }
 */
router.get("/hotels/:hotelId/branch-income", getBranchwiseIncome);

/**
 * @route   GET /api/v1/super-admin/branches
 * @desc    Get all branches with hotel and admin details
 * @access  Private (Super Admin)
 * @query   { page, limit, search, status, sortBy, sortOrder }
 * @returns { branches[], pagination }
 */
router.get("/branches", getAllBranchesWithDetails);

/**
 * @route   GET /api/v1/super-admin/managers
 * @desc    Get all managers with branch, hotel, and admin details
 * @access  Private (Super Admin)
 * @query   { page, limit, search, status, sortBy, sortOrder }
 * @returns { managers[], pagination }
 */
router.get("/managers", getAllManagersWithDetails);

/**
 * @route   GET /api/v1/super-admin/staff
 * @desc    Get all staff with complete hierarchy details
 * @access  Private (Super Admin)
 * @query   { page, limit, search, status, role, sortBy, sortOrder }
 * @returns { staff[], pagination }
 */
router.get("/staff", getAllStaffWithDetails);

/**
 * @route   GET /api/v1/super-admin/analytics
 * @desc    Get comprehensive revenue analytics and trends
 * @access  Private (Super Admin)
 * @returns { overview, trends, topPerformingHotels }
 */
router.get("/analytics", getRevenueAnalytics);

/**
 * @route   GET /api/v1/super-admin/statistics
 * @desc    Get system-wide statistics and health metrics
 * @access  Private (Super Admin)
 * @returns { counts, growth, healthMetrics }
 */
router.get("/statistics", getSystemStatistics);

export default router;
