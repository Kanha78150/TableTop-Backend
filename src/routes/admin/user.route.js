import express from "express";
import {
  getAllUsers,
  getUserById,
  updateUser,
  blockUser,
  unblockUser,
  deleteUser,
} from "../../controllers/admin/user.controller.js";
import {
  rbac,
  requireSuperAdmin,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

router.get("/", rbac({ permissions: ["manageUsers"] }), getAllUsers);

router.get("/:userId", rbac({ permissions: ["manageUsers"] }), getUserById);

router.put("/:userId", rbac({ permissions: ["manageUsers"] }), updateUser);

router.post(
  "/:userId/block",
  rbac({ permissions: ["manageUsers"] }),
  blockUser
);

router.post(
  "/:userId/unblock",
  rbac({ permissions: ["manageUsers"] }),
  unblockUser
);

router.delete("/:userId", requireSuperAdmin, deleteUser);

export default router;
