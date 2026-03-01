import express from "express";
import {
  getAllManagers,
  getManagerById,
  createManager,
  updateManager,
  updateManagerPermissions,
  deleteManager,
  deactivateManager,
  reactivateManager,
} from "../../controllers/admin/manager.controller.js";
import { getStaffByManager } from "../../controllers/admin/staff.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  checkResourceLimit,
} from "../../middleware/subscriptionAuth.middleware.js";
import { upload } from "../../middleware/multer.middleware.js";

const router = express.Router();

router.get(
  "/",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  getAllManagers
);

router.get(
  "/:managerId",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  getManagerById
);

router.post(
  "/",
  upload.single("profileImage"),
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  checkResourceLimit("managers"),
  createManager
);

router.put(
  "/:managerId",
  upload.single("profileImage"),
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  updateManager
);

router.delete(
  "/:managerId",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  deleteManager
);

router.patch(
  "/:managerId/deactivate",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  deactivateManager
);

router.patch(
  "/:managerId/reactivate",
  rbac({ permissions: ["manageManagers"] }),
  requireActiveSubscription,
  reactivateManager
);

router.put(
  "/:managerId/permissions",
  rbac({ roles: ["admin", "super_admin"] }),
  updateManagerPermissions
);

// Get staff under a specific manager
router.get(
  "/:managerId/staff",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  getStaffByManager
);

export default router;
