import express from "express";
import { validateBulkGstUpdate } from "../validators/foodItem.validators.js";

// Import Hotel and Branch Controllers
import {
  createHotel,
  getAllHotels,
  getHotelById,
  getHotelBranchesByLocation,
  updateHotel,
  deleteHotel,
  deactivateHotel,
  reactivateHotel,
  searchHotels,
  searchHotelsByLocation,
} from "../controllers/admin/hotel.controller.js";

import {
  createBranch,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  deactivateBranch,
  reactivateBranch,
  searchBranchesByLocation,
  getBranchesByHotel,
} from "../controllers/admin/branch.controller.js";

// User Management Controllers
import {
  getAllUsers,
  getUserById,
  updateUser,
  blockUser,
  unblockUser,
  deleteUser,
  getAllManagers,
  getManagerById,
  createManager,
  updateManager,
  updateManagerPermissions,
  deleteManager,
  deactivateManager,
  reactivateManager,
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffPermissions,
  deleteStaff,
  deactivateStaff,
  reactivateStaff,
  assignStaffToManager,
  getStaffByManager,
} from "../controllers/admin/user.controller.js";

// Menu Management Controllers
import {
  getAllCategories,
  createCategory,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getAllFoodItems,
  createFoodItem,
  getFoodItemById,
  updateFoodItem,
  deleteFoodItem,
  updateFoodItemAvailability,
  updateSingleFoodItemAvailability,
  bulkUpdateGstRate,
} from "../controllers/admin/menu.controller.js";

// Table Management Controllers
import {
  generateTableQRCodes,
  getTables,
  getTableById,
  updateTable,
  deleteTable,
  regenerateTableQR,
  getAvailableTables,
  bulkUpdateTableStatus,
  getTableStats,
} from "../controllers/admin/table.controller.js";

// Offer Management Controllers
import offerController from "../controllers/admin/offer.controller.js";

// Analytics Controllers
import {
  getDashboardOverview,
  getSalesReport,
  getProfitLossReport,
  getCustomerAnalytics,
  getBestSellingItems,
} from "../controllers/admin/analytics.controller.js";

// Coin Management Controllers
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
} from "../controllers/admin/coin.controller.js";

// Complaint Management Controllers
import {
  getAllComplaints,
  getComplaintDetails,
  updateComplaintStatus,
  assignComplaintToStaff,
  reassignComplaint,
  addComplaintResponse,
  resolveComplaint,
  getEscalatedComplaints,
  getComplaintAnalytics,
} from "../controllers/admin/complaint.controller.js";

// ===== SCHEDULED JOBS MANAGEMENT =====
import {
  getJobsStatus,
  scheduleOneTimeReset,
  stopJob,
  startJob,
  stopAllJobs,
} from "../controllers/scheduledJobs.controller.js";

// Import Middleware
import {
  authenticateAdmin,
  requireSuperAdmin,
  requirePermission,
  requirePermissions,
  requireBranchAccess,
  requireFinancialAccess,
  rbac,
} from "../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  checkResourceLimit,
  requireFeature,
} from "../middleware/subscriptionAuth.middleware.js";

const router = express.Router();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// ======================
// HOTEL MANAGEMENT ROUTES
// ======================
router.post(
  "/hotels",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  checkResourceLimit("hotels"),
  createHotel
);

router.get(
  "/hotels",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getAllHotels
);

router.get(
  "/hotels/search",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  searchHotels
);

router.get(
  "/hotels/search-by-location",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  searchHotelsByLocation
);

router.get(
  "/hotels/:hotelId",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getHotelById
);

router.put(
  "/hotels/:hotelId",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  updateHotel
);

router.delete(
  "/hotels/:hotelId",
  rbac({ roles: ["admin", "super_admin"] }),
  requireActiveSubscription,
  deleteHotel
);
router.patch(
  "/hotels/:hotelId/deactivate",
  rbac({ roles: ["admin", "super_admin"] }),
  requireActiveSubscription,
  deactivateHotel
);

router.patch(
  "/hotels/:hotelId/reactivate",
  rbac({ roles: ["admin", "super_admin"] }),
  requireActiveSubscription,
  reactivateHotel
);

router.get(
  "/hotels/:hotelId/branches",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getHotelBranchesByLocation
);

// ======================
// BRANCH MANAGEMENT ROUTES
// ======================
router.post(
  "/branches",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  checkResourceLimit("branches"),
  createBranch
);

router.get(
  "/branches",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getAllBranches
);

router.get(
  "/branches/search-by-location",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  searchBranchesByLocation
);

router.get(
  "/branches/hotel/:hotelId",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getBranchesByHotel
);

router.get(
  "/branches/:branchId",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getBranchById
);

router.put(
  "/branches/:branchId",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  updateBranch
);

router.delete(
  "/branches/:branchId",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  requireActiveSubscription,
  deleteBranch
);

// Branch deactivation/reactivation routes
router.patch(
  "/branches/:branchId/deactivate",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  requireActiveSubscription,
  deactivateBranch
);

router.patch(
  "/branches/:branchId/reactivate",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  requireActiveSubscription,
  reactivateBranch
);

// ======================
// USER MANAGEMENT ROUTES
// ======================

// Customer Management
router.get("/users", rbac({ permissions: ["manageUsers"] }), getAllUsers);

router.get(
  "/users/:userId",
  rbac({ permissions: ["manageUsers"] }),
  getUserById
);

router.put(
  "/users/:userId",
  rbac({ permissions: ["manageUsers"] }),
  updateUser
);

router.post(
  "/users/:userId/block",
  rbac({ permissions: ["manageUsers"] }),
  blockUser
);

router.post(
  "/users/:userId/unblock",
  rbac({ permissions: ["manageUsers"] }),
  unblockUser
);

router.delete("/users/:userId", requireSuperAdmin, deleteUser);

// Manager Management
router.get(
  "/managers",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  getAllManagers
);

router.get(
  "/managers/:managerId",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  getManagerById
);

router.post(
  "/managers",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  checkResourceLimit("managers"),
  createManager
);

router.put(
  "/managers/:managerId",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  updateManager
);

router.delete(
  "/managers/:managerId",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  deleteManager
);

// Manager deactivation/reactivation routes
router.patch(
  "/managers/:managerId/deactivate",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  deactivateManager
);

router.patch(
  "/managers/:managerId/reactivate",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  reactivateManager
);

router.put(
  "/managers/:managerId/permissions",
  rbac({ roles: ["admin", "super_admin"] }),
  updateManagerPermissions
);

// Staff Management
router.get(
  "/staff",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  getAllStaff
);

router.get(
  "/staff/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  getStaffById
);

router.post(
  "/staff",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  checkResourceLimit("staff"),
  createStaff
);

router.put(
  "/staff/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  updateStaff
);

// Staff Permissions Update (Admin and Super Admin Only - not Branch Admin)
router.put(
  "/staff/:staffId/permissions",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  updateStaffPermissions
);

router.delete(
  "/staff/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  deleteStaff
);

// Staff deactivation/reactivation routes
router.patch(
  "/staff/:staffId/deactivate",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  deactivateStaff
);

router.patch(
  "/staff/:staffId/reactivate",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  reactivateStaff
);

// Staff-Manager Assignment (Admin Only)
router.put(
  "/staff/:staffId/assign-manager",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  assignStaffToManager
);

router.get(
  "/managers/:managerId/staff",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  getStaffByManager
);

// ======================
// MENU MANAGEMENT ROUTES
// ======================

// Food Categories
router.get(
  "/menu/categories",
  rbac({ permissions: ["manageMenu"] }),
  getAllCategories
);

router.post(
  "/menu/categories",
  rbac({ permissions: ["manageMenu"] }),
  createCategory
);

router.get(
  "/menu/categories/:categoryId",
  rbac({ permissions: ["manageMenu"] }),
  getCategoryById
);

router.put(
  "/menu/categories/:categoryId",
  rbac({ permissions: ["manageMenu"] }),
  updateCategory
);

router.delete(
  "/menu/categories/:categoryId",
  rbac({ permissions: ["manageMenu"] }),
  deleteCategory
);

// Food Items
router.get(
  "/menu/items",
  rbac({ permissions: ["manageMenu"] }),
  getAllFoodItems
);

router.post(
  "/menu/items",
  rbac({ permissions: ["manageMenu"] }),
  createFoodItem
);

router.get(
  "/menu/items/:itemId",
  rbac({ permissions: ["manageMenu"] }),
  getFoodItemById
);

router.put(
  "/menu/items/:itemId",
  rbac({ permissions: ["manageMenu"] }),
  updateFoodItem
);

router.delete(
  "/menu/items/:itemId",
  rbac({ permissions: ["manageMenu"] }),
  deleteFoodItem
);

// Update single item availability
router.patch(
  "/menu/items/:itemId/availability",
  rbac({ permissions: ["manageMenu"] }),
  updateSingleFoodItemAvailability
);

// Bulk update items availability
router.patch(
  "/menu/items/availability",
  rbac({ permissions: ["manageMenu"] }),
  updateFoodItemAvailability
);

// Bulk update GST rates by category
router.put(
  "/menu/bulk-update-gst",
  rbac({ permissions: ["manageMenu"] }),
  validateBulkGstUpdate,
  bulkUpdateGstRate
);

// ======================
// TABLE MANAGEMENT ROUTES
// ======================

// Generate QR codes for tables
router.post(
  "/tables/generate-qr",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  checkResourceLimit("tables"),
  generateTableQRCodes
);

// Get all tables
router.get(
  "/tables",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  getTables
);

// Get available tables
router.get(
  "/tables/available",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  getAvailableTables
);

// Get table statistics
router.get(
  "/tables/stats",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  getTableStats
);

// Bulk update table status (must be before :tableId routes)
router.put(
  "/tables/bulk-status",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  bulkUpdateTableStatus
);

// Get table by ID
router.get(
  "/tables/:tableId",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  getTableById
);

// Update table
router.put(
  "/tables/:tableId",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  updateTable
);

// Delete table
router.delete(
  "/tables/:tableId",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  deleteTable
);

// Regenerate QR code for table
router.post(
  "/tables/:tableId/regenerate-qr",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  regenerateTableQR
);

// Offers Management
router.get(
  "/offers",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getAllOffers
);

router.get(
  "/offers/stats",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getOfferStats
);

router.get(
  "/offers/active",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getActiveOffersFor
);

router.post(
  "/offers",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.createOffer
);

router.get(
  "/offers/code/:code",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getOfferByCode
);

router.get(
  "/offers/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.getOfferById
);

router.put(
  "/offers/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.updateOffer
);

router.patch(
  "/offers/:offerId/toggle",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.toggleOfferStatus
);

router.delete(
  "/offers/:offerId",
  rbac({ permissions: ["manageOffers"] }),
  requireActiveSubscription,
  requireFeature("offerManagement"),
  offerController.deleteOffer
);

router.post(
  "/offers/:code/apply",
  rbac({ permissions: ["manageOffers"] }),
  offerController.applyOffer
);

router.post(
  "/offers/apply-multiple",
  rbac({ permissions: ["manageOffers"] }),
  offerController.applyOffers
);

// ======================
// ANALYTICS & REPORTS ROUTES
// ======================

// Dashboard
router.get(
  "/dashboard",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getDashboardOverview
);

// Sales Reports
router.get(
  "/reports/sales",
  rbac({ permissions: ["viewReports"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getSalesReport
);

// Profit & Loss Reports
router.get(
  "/reports/profit-loss",
  rbac({ permissions: ["viewFinancials"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getProfitLossReport
);

// Customer Analytics
router.get(
  "/analytics/customers",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getCustomerAnalytics
);

// Best Selling Items
router.get(
  "/reports/best-sellers",
  rbac({ permissions: ["viewReports"] }),
  getBestSellingItems
);

// ======================
// COIN MANAGEMENT ROUTES
// ======================

// Get current coin settings
router.get(
  "/coins/settings",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getCoinSettings
);

// Create initial coin settings (First-time setup by admin)
router.post(
  "/coins/settings",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  createCoinSettings
);

// Update coin settings (48-hour restriction applies)
router.put(
  "/coins/settings",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  updateCoinSettings
);

// Debug coin settings (temporary for troubleshooting)
router.get(
  "/coins/debug",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  debugCoinSettings
);

// Get coin settings history
router.get(
  "/coins/settings/history",
  rbac({ permissions: ["managePricing"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getCoinSettingsHistory
);

// Get coin analytics and statistics
router.get(
  "/coins/analytics",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getCoinAnalytics
);

// Make manual coin adjustment for a user
router.post(
  "/coins/adjust",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  makeManualCoinAdjustment
);

// Get users with coin balances
router.get(
  "/coins/users",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getUsersWithCoins
);

// Get detailed coin transaction history
router.get(
  "/coins/transactions",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  getCoinTransactionHistory
);

// Reverse/cancel a coin transaction
router.post(
  "/coins/transactions/:transactionId/reverse",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  requireFeature("coinSystem"),
  reverseCoinTransaction
);

// Get status of all scheduled jobs
router.get(
  "/scheduled-jobs/status",
  rbac({ permissions: ["manageSystem"] }),
  getJobsStatus
);

// Schedule a one-time round-robin reset
router.post(
  "/scheduled-jobs/reset-round-robin",
  rbac({ permissions: ["manageSystem"] }),
  scheduleOneTimeReset
);

// Stop a scheduled job
router.post(
  "/scheduled-jobs/:jobName/stop",
  rbac({ permissions: ["manageSystem"] }),
  stopJob
);

// Start a scheduled job
router.post(
  "/scheduled-jobs/:jobName/start",
  rbac({ permissions: ["manageSystem"] }),
  startJob
);

// Stop all scheduled jobs
router.post(
  "/scheduled-jobs/stop-all",
  rbac({ permissions: ["manageSystem"] }),
  stopAllJobs
);

// ======================
// COMPLAINT MANAGEMENT ROUTES
// ======================

// Get all complaints (hotel-wide for branch admin, cross-hotel for super admin)
router.get(
  "/complaints",
  rbac({ permissions: ["viewReports"] }),
  requireActiveSubscription,
  getAllComplaints
);

// Get escalated complaints
router.get(
  "/complaints/escalated",
  rbac({ permissions: ["viewReports"] }),
  requireActiveSubscription,
  getEscalatedComplaints
);

// Get complaint analytics
router.get(
  "/complaints/analytics",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getComplaintAnalytics
);

// Get specific complaint details
router.get(
  "/complaints/:complaintId",
  rbac({ permissions: ["viewReports"] }),
  requireActiveSubscription,
  getComplaintDetails
);

// Update complaint status
router.put(
  "/complaints/:complaintId/status",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  updateComplaintStatus
);

// Assign complaint to staff
router.put(
  "/complaints/:complaintId/assign/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  assignComplaintToStaff
);

// Reassign complaint to different staff
router.put(
  "/complaints/:complaintId/reassign/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  reassignComplaint
);

// Add response to complaint
router.post(
  "/complaints/:complaintId/response",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  addComplaintResponse
);

// Resolve complaint
router.put(
  "/complaints/:complaintId/resolve",
  rbac({ permissions: ["manageUsers"] }),
  requireActiveSubscription,
  resolveComplaint
);

// ===== ACCOUNTING & TRANSACTIONS =====
import accountingRoutes from "./admin/accounting.route.js";

// Mount accounting routes
router.use("/accounting", accountingRoutes);

// ===== REVIEW MANAGEMENT =====
import reviewRoutes from "./admin/review.route.js";

// Mount review routes
router.use("/reviews", reviewRoutes);

// ===== ORDER MANAGEMENT =====
import {
  getAllOrders,
  getOrderDetails,
  confirmCashPayment,
} from "../controllers/admin/order.controller.js";

// Get all orders (supports branchId, staffId, status, date filters)
router.get("/orders", rbac({ permissions: ["manageUsers"] }), getAllOrders);

// Get order details by ID
router.get(
  "/orders/:orderId",
  rbac({ permissions: ["manageUsers"] }),
  getOrderDetails
);

// Confirm cash payment for an order
router.put(
  "/orders/:orderId/confirm-payment",
  rbac({ permissions: ["manageUsers"] }),
  confirmCashPayment
);

export default router;
