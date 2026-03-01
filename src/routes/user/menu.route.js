// src/routes/user/menu.route.js - User Menu Routes (public)
import express from "express";
import userMenuController from "../../controllers/user/menu.controller.js";

const router = express.Router();

// Categories
router.get("/categories", userMenuController.getCategories);
router.get("/categories/:categoryId", userMenuController.getCategoryById);
router.get(
  "/categories/:categoryId/items",
  userMenuController.getItemsByCategory
);

// Hotel-specific categories (for QR scan scenarios)
router.get(
  "/categories/hotel/:hotelId",
  userMenuController.getCategoriesForScannedHotel
);
router.get(
  "/categories/hotel/:hotelId/:branchId",
  userMenuController.getCategoriesForScannedHotel
);

// Food Items
router.get("/items", userMenuController.getFoodItems);
router.get("/items/featured", userMenuController.getFeaturedItems);
router.get("/items/:itemId", userMenuController.getFoodItemById);

// Location-specific menu (for QR scan browsing)
router.get("/location/:hotelId", userMenuController.getMenuForLocation);
router.get(
  "/location/:hotelId/:branchId",
  userMenuController.getMenuForLocation
);

// Search
router.get("/search", userMenuController.searchMenu);

export default router;
