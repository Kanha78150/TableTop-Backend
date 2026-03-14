import express from "express";
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
} from "../../controllers/admin/table.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  checkResourceLimit,
} from "../../middleware/subscriptionAuth.middleware.js";

const router = express.Router();

router.post(
  "/generate-qr",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  checkResourceLimit("tables"),
  generateTableQRCodes
);

router.get(
  "/",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  getTables
);

router.get(
  "/available",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  getAvailableTables
);

router.get(
  "/stats",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  getTableStats
);

// Bulk update table status (must be before :tableId routes)
router.put(
  "/bulk-status",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  bulkUpdateTableStatus
);

router.get(
  "/:tableId",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  getTableById
);

router.put(
  "/:tableId",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  updateTable
);

router.delete(
  "/:tableId",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  deleteTable
);

router.post(
  "/:tableId/regenerate-qr",
  rbac({ permissions: ["manageTables"] }),
  requireActiveSubscription,
  regenerateTableQR
);

export default router;
