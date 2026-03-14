// src/routes/manager/menu.route.js - Manager Menu Management Routes
import express from "express";
import { validateBulkGstUpdate } from "../../validators/foodItem.validators.js";
import {
  requireRole,
  requireManagerOrHigher,
  requirePermission,
} from "../../middleware/roleAuth.middleware.js";
import {
  getMenuItems,
  getMenuItem,
  updateMenuItemAvailability,
  updateBulkMenuItemAvailability,
  getFoodCategories,
  getFoodCategory,
  bulkUpdateGstRate,
} from "../../controllers/manager/menu.controller.js";

const router = express.Router();

// Food Categories - Read Only
router.get(
  "/categories",
  requireManagerOrHigher,
  requirePermission("viewMenu"),
  getFoodCategories
);

router.get(
  "/categories/:categoryId",
  requireManagerOrHigher,
  requirePermission("viewMenu"),
  getFoodCategory
);

// Food Items - Read Only + Availability Updates
router.get(
  "/items",
  requireManagerOrHigher,
  requirePermission("viewMenu"),
  getMenuItems
);

router.get(
  "/items/:itemId",
  requireManagerOrHigher,
  requirePermission("viewMenu"),
  getMenuItem
);

router.put(
  "/items/:itemId/availability",
  requireRole(["branch_manager"]),
  requirePermission("updateMenuItems"),
  updateMenuItemAvailability
);

router.patch(
  "/items/bulk-availability",
  requireRole(["branch_manager"]),
  requirePermission("updateMenuItems"),
  updateBulkMenuItemAvailability
);

router.put(
  "/bulk-update-gst",
  requireRole(["branch_manager"]),
  requirePermission("updateMenuItems"),
  validateBulkGstUpdate,
  bulkUpdateGstRate
);

export default router;
