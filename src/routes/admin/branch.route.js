import express from "express";
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
} from "../../controllers/admin/branch.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  checkResourceLimit,
} from "../../middleware/subscriptionAuth.middleware.js";
import { upload } from "../../middleware/multer.middleware.js";

const router = express.Router();

router.post(
  "/",
  upload.array("images", 5),
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  checkResourceLimit("branches"),
  createBranch
);

router.get(
  "/",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getAllBranches
);

router.get(
  "/search-by-location",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  searchBranchesByLocation
);

router.get(
  "/hotel/:hotelId",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getBranchesByHotel
);

router.get(
  "/:branchId",
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  getBranchById
);

router.put(
  "/:branchId",
  upload.array("images", 10),
  rbac({ permissions: ["manageBranches"] }),
  requireActiveSubscription,
  updateBranch
);

router.delete(
  "/:branchId",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  requireActiveSubscription,
  deleteBranch
);

router.patch(
  "/:branchId/deactivate",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  requireActiveSubscription,
  deactivateBranch
);

router.patch(
  "/:branchId/reactivate",
  rbac({
    roles: ["admin", "super_admin", "branch_admin"],
    permissions: ["manageBranches"],
  }),
  requireActiveSubscription,
  reactivateBranch
);

export default router;
