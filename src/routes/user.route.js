import express from "express";
import {
  getHotels,
  getHotelDetails,
  getHotelBranchesByLocation,
  searchNearbyHotels,
  getBranchDetails,
} from "../controllers/user/hotelController.js";

import userMenuController from "../controllers/user/menuController.js";
import {
  submitComplaint,
  getMyComplaints,
  getComplaintDetails,
  addFollowUpMessage,
  rateResolution,
  reopenComplaint,
  getMyComplaintsDashboard,
} from "../controllers/user/complaintController.js";
import {
  addToCart,
  getCart,
  updateItemQuantity,
  removeCartItem,
  clearCart,
  validateCart,
  getCartSummary,
  updateItemCustomizations,
  getAllUserCarts,
  transferToCheckout,
  quickAddToCart,
  getCartItemCount,
  bulkUpdateCart,
} from "../controllers/user/cartController.js";
import {
  placeOrder,
  getMyOrders,
  getOrderDetails,
  getOrderPaymentInfo,
  cancelOrder,
  reorder,
  getOrderStatus,
  getActiveOrders,
  getOrderHistory,
  getTableOrderHistory,
} from "../controllers/user/orderController.js";
import {
  getOrderRefundStatus,
  getUserRefunds,
} from "../controllers/user/refundStatusController.js";
import {
  getCoinBalance,
  getCoinDetails,
  getCoinHistory,
  getExpiringCoins,
  calculateCoinDiscount,
  getMaxCoinsUsable,
  calculateCoinsEarning,
  getCoinSystemInfo,
} from "../controllers/user/coinController.js";
import {
  submitReview,
  getMyReviews,
  updateReview,
  // checkEligibility,
  markReviewHelpful,
  getHotelReviews,
  getBranchReviews,
  getReviewDetails,
  getReviewByOrderId,
} from "../controllers/user/reviewController.js";
import userOfferController from "../controllers/user/offerController.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";

const router = express.Router();

// Hotel routes for users
router.get("/hotels", getHotels);
router.get("/hotels/search-nearby", searchNearbyHotels);
router.get("/hotels/:hotelId", getHotelDetails);
router.get("/hotels/:hotelId/branches", getHotelBranchesByLocation);

// Branch routes for users
router.get("/branches/:branchId", getBranchDetails);

// Menu routes for users
// Categories
router.get("/menu/categories", userMenuController.getCategories);
router.get("/menu/categories/:categoryId", userMenuController.getCategoryById);
router.get(
  "/menu/categories/:categoryId/items",
  userMenuController.getItemsByCategory
);

// Hotel-specific categories (for QR scan scenarios)
router.get(
  "/menu/categories/hotel/:hotelId",
  userMenuController.getCategoriesForScannedHotel
);
router.get(
  "/menu/categories/hotel/:hotelId/:branchId",
  userMenuController.getCategoriesForScannedHotel
);

// Food Items
router.get("/menu/items", userMenuController.getFoodItems);
router.get("/menu/items/featured", userMenuController.getFeaturedItems);
router.get("/menu/items/:itemId", userMenuController.getFoodItemById);

// Location-specific menu (for QR scan browsing)
router.get("/menu/location/:hotelId", userMenuController.getMenuForLocation);
router.get(
  "/menu/location/:hotelId/:branchId",
  userMenuController.getMenuForLocation
);

// Search
router.get("/menu/search", userMenuController.searchMenu);

// Cart routes for users (protected with authentication)
// Basic cart operations
router.post("/cart/add", authenticateUser, addToCart);
router.post("/cart/quick-add", authenticateUser, quickAddToCart);
router.get("/cart/all", authenticateUser, getAllUserCarts);

// Cart item operations (more specific routes first)
router.put("/cart/item/:itemId", authenticateUser, updateItemQuantity);
router.put(
  "/cart/item/:itemId/customizations",
  authenticateUser,
  updateItemCustomizations
);
router.delete("/cart/item/:itemId", authenticateUser, removeCartItem);

// Cart management
router.delete("/cart/clear", authenticateUser, clearCart);
router.put("/cart/bulk-update", authenticateUser, bulkUpdateCart);
router.post("/cart/validate", authenticateUser, validateCart);

// Checkout
router.post("/cart/checkout", authenticateUser, transferToCheckout);

// Cart retrieval routes (SPECIFIC routes FIRST, parameterized routes LAST)
router.get(
  "/cart/summary/:hotelId/:branchId",
  authenticateUser,
  getCartSummary
);
router.get("/cart/summary/:hotelId", authenticateUser, getCartSummary); // For hotels without branches
router.get(
  "/cart/count/:hotelId/:branchId",
  authenticateUser,
  getCartItemCount
);
router.get("/cart/count/:hotelId", authenticateUser, getCartItemCount); // For hotels without branches
// Parameterized routes MUST come after specific routes
router.get("/cart/:hotelId/:branchId", authenticateUser, getCart);
router.get("/cart/:hotelId", authenticateUser, getCart); // For hotels without branches

// ======================
// ORDER ROUTES (PROTECTED)
// ======================

// Note: Order placement is now handled through enhanced checkout
// router.post("/orders/place", authenticateUser, placeOrder); // REMOVED

// Get user's orders with filters
router.get("/orders", authenticateUser, getMyOrders);

// Get active orders
router.get("/orders/active", authenticateUser, getActiveOrders);

// Get order history
router.get("/orders/history", authenticateUser, getOrderHistory);

// Get table order history
router.get("/orders/table-history", authenticateUser, getTableOrderHistory);

// Get order payment information (for payment page) - MUST be before :orderId route
router.get(
  "/orders/:orderId/payment-info",
  authenticateUser,
  getOrderPaymentInfo
);

// Get specific order details
router.get("/orders/:orderId", authenticateUser, getOrderDetails);

// Get order status/tracking info
router.get("/orders/:orderId/status", authenticateUser, getOrderStatus);

// Cancel order
router.put("/orders/:orderId/cancel", authenticateUser, cancelOrder);

// Reorder from previous order
router.post("/orders/:orderId/reorder", authenticateUser, reorder);

// ======================
// REFUND STATUS ROUTES (PROTECTED)
// ======================

// Get refund status for a specific order
router.get(
  "/orders/:orderId/refund-status",
  authenticateUser,
  getOrderRefundStatus
);

// Get all user's refunds
router.get("/refunds", authenticateUser, getUserRefunds);

// ======================
// COIN SYSTEM ROUTES (PROTECTED)
// ======================

// Get user's coin balance and basic statistics
router.get("/coins/balance", authenticateUser, getCoinBalance);

// Get detailed coin information including history and expiring coins
router.get("/coins/details", authenticateUser, getCoinDetails);

// Get coin transaction history with filters
router.get("/coins/history", authenticateUser, getCoinHistory);

// Get coins that will expire soon
router.get("/coins/expiring", authenticateUser, getExpiringCoins);

// Calculate coin discount for an order (preview)
router.post(
  "/coins/calculate-discount",
  authenticateUser,
  calculateCoinDiscount
);

// Get maximum coins that can be used for an order
router.get("/coins/max-usable", authenticateUser, getMaxCoinsUsable);

// Calculate coins that would be earned for an order (preview)
router.get("/coins/calculate-earning", authenticateUser, calculateCoinsEarning);

// Get coin system information and rules
router.get("/coins/info", authenticateUser, getCoinSystemInfo);

// ======================
// OFFER ROUTES (PUBLIC - no auth required for browsing offers)
// ======================

// Get available offers for a specific hotel (all branches)
router.get(
  "/offers/available/:hotelId",
  userOfferController.getAvailableOffers
);

// Get available offers for a specific hotel and branch
router.get(
  "/offers/available/:hotelId/:branchId",
  userOfferController.getAvailableOffers
);

// Validate offer code for a specific hotel/branch
router.get("/offers/validate/:code", userOfferController.validateOfferCode);

// Get smart offer recommendations based on user's cart (requires authentication)
router.get(
  "/offers/recommendations/:hotelId",
  authenticateUser,
  userOfferController.getSmartOfferRecommendations
);

// Get smart offer recommendations for specific branch (requires authentication)
router.get(
  "/offers/recommendations/:hotelId/:branchId",
  authenticateUser,
  userOfferController.getSmartOfferRecommendations
);

// ======================
// COMPLAINT ROUTES (PROTECTED - requires authentication)
// ======================

// Submit a new complaint
router.post(
  "/complaints",
  authenticateUser,
  upload.array("attachments", 5),
  submitComplaint
);

// Get user's complaint dashboard summary
router.get("/complaints/dashboard", authenticateUser, getMyComplaintsDashboard);

// Get all complaints for logged-in user
router.get("/complaints", authenticateUser, getMyComplaints);

// Get specific complaint details
router.get("/complaints/:complaintId", authenticateUser, getComplaintDetails);

// Add follow-up message to complaint
router.post(
  "/complaints/:complaintId/followup",
  authenticateUser,
  upload.array("attachments", 3),
  addFollowUpMessage
);

// Rate complaint resolution
router.put("/complaints/:complaintId/rate", authenticateUser, rateResolution);

// Reopen a resolved complaint
router.put(
  "/complaints/:complaintId/reopen",
  authenticateUser,
  reopenComplaint
);

// ======================
// REVIEW ROUTES (PUBLIC AND PROTECTED)
// ======================

// Public review routes (no authentication required)
// Get all reviews for a specific hotel
router.get("/reviews/hotel/:hotelId", getHotelReviews);

// Get all reviews for a specific branch
router.get("/reviews/branch/:branchId", getBranchReviews);

// Protected review routes (authentication required)
// Submit a new review for a completed order
router.post("/reviews", authenticateUser, submitReview);

// Get all reviews submitted by the logged-in user
router.get("/reviews/my-reviews", authenticateUser, getMyReviews);

// Update an existing review (only if status is pending)
router.put("/reviews/:reviewId", authenticateUser, updateReview);

// Check if user is eligible to review a specific order
// router.get("/reviews/eligibility/:orderId", authenticateUser, checkEligibility);

// Get review by order ID (optional authentication - can be used by owner or public for approved reviews)
router.get("/reviews/order/:orderId", getReviewByOrderId);

// Mark a review as helpful (toggle on/off)
router.post("/reviews/:reviewId/helpful", authenticateUser, markReviewHelpful);

// Get specific review details (public - must come last to avoid matching specific routes)
router.get("/reviews/:reviewId", getReviewDetails);

export default router;
