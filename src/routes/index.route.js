import { Router } from "express";
import userAuthRoutes from "./auth/userAuth.route.js";
import adminAuthRoutes from "./auth/adminAuth.route.js";
import adminRoutes from "./admin.route.js";
import userRoutes from "./user.route.js";

const router = Router();

// Authentication routes
router.use("/auth/user", userAuthRoutes);
router.use("/auth/admin", adminAuthRoutes);

// Admin routes (authentication is handled within the admin routes)
router.use("/admin", adminRoutes);

// User routes (you might want to add authentication middleware here)
router.use("/user", userRoutes);

// Health check
router.get("/", (req, res) => {
  res.json({ message: "API Root 🚀" });
});

export default router;
