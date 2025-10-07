import express from "express";

const router = express.Router();

// Simple health check route for testing
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Payment service is running",
    timestamp: new Date().toISOString(),
    service: "PhonePe Payment Gateway",
  });
});

// Simple test route
router.get("/test", (req, res) => {
  res.json({ message: "Payment routes working!" });
});

export default router;
