import { Router } from "express";
import {
  loginManager,
  logoutManager,
  getManagerProfile,
  changeManagerPassword,
  deactivateAccount,
  reactivateAccount,
} from "../../controllers/auth/managerAuth.controller.js";
import { authenticateManager } from "../../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.post("/login", loginManager);

// Protected routes (require authentication)
router.post("/logout", authenticateManager, logoutManager);
router.get("/profile", authenticateManager, getManagerProfile);
router.put("/change-password", authenticateManager, changeManagerPassword);
router.patch("/deactivate", authenticateManager, deactivateAccount);
router.patch("/reactivate", authenticateManager, reactivateAccount);

export default router;
