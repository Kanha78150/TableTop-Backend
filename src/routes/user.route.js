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
import { authenticateUser } from "../middleware/auth.middleware.js";

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

// Food Items
router.get("/menu/items", userMenuController.getFoodItems);
router.get("/menu/items/featured", userMenuController.getFeaturedItems);
router.get("/menu/items/:itemId", userMenuController.getFoodItemById);

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

// Place order from cart
router.post("/orders/place", authenticateUser, placeOrder);

// Get user's orders with filters
router.get("/orders", authenticateUser, getMyOrders);

// Get active orders
router.get("/orders/active", authenticateUser, getActiveOrders);

// Get order history
router.get("/orders/history", authenticateUser, getOrderHistory);

// Get table order history
router.get("/orders/table-history", authenticateUser, getTableOrderHistory);

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

export default router;
