import express from "express";
import {
  getAllStaff,
  getStaffById,
  createStaff,
  updateStaff,
  updateStaffPermissions,
  deleteStaff,
  deactivateStaff,
  reactivateStaff,
  assignStaffToManager,
} from "../../controllers/admin/staff.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  checkResourceLimit,
} from "../../middleware/subscriptionAuth.middleware.js";
import { upload } from "../../middleware/multer.middleware.js";

const router = express.Router();

router.get(
  "/",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  getAllStaff
);

router.get(
  "/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  getStaffById
);

router.post(
  "/",
  upload.single("profileImage"),
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  checkResourceLimit("staff"),
  createStaff
);

router.put(
  "/:staffId",
  upload.single("profileImage"),
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  updateStaff
);

router.put(
  "/:staffId/permissions",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  updateStaffPermissions
);

router.delete(
  "/:staffId",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  deleteStaff
);

router.patch(
  "/:staffId/deactivate",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  deactivateStaff
);

router.patch(
  "/:staffId/reactivate",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  reactivateStaff
);

router.put(
  "/:staffId/assign-manager",
  rbac({ permissions: ["manageStaff"] }),
  requireActiveSubscription,
  assignStaffToManager
);

export default router;
