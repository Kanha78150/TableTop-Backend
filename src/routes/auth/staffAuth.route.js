import { Router } from "express";
import {
  loginStaff,
  logoutStaff,
  getStaffProfile,
  changeStaffPassword,
  deactivateAccount,
  reactivateAccount,
} from "../../controllers/auth/staffAuth.controller.js";
import { authenticateStaff } from "../../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.post("/login", loginStaff);

// Protected routes (require authentication)
router.post("/logout", authenticateStaff, logoutStaff);
router.get("/profile", authenticateStaff, getStaffProfile);
router.put("/change-password", authenticateStaff, changeStaffPassword);
router.patch("/deactivate", authenticateStaff, deactivateAccount);
router.patch("/reactivate", authenticateStaff, reactivateAccount);

export default router;
