import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "./config/oauth.js";

// Import routes
import routes from "./routes/index.route.js";
import { errorHandler } from "./middleware/errorHandler.middleware.js";

const app = express();

// Middleware
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));
app.use(express.static("public"));

// CORS Configuration
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) =>
  origin.trim()
);
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "HEAD", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "x-razorpay-signature"],
  })
);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  })
);

// Logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(cookieParser());

// Session configuration for OAuth
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret-for-cloud-run",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// API Routes
app.use("/api/v1", routes);

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Restaurant Management System API is running ✅" });
});

// Email queue health check
app.get("/health/email-queue", async (req, res) => {
  try {
    const { emailQueueService } = await import(
      "./services/emailQueueService.js"
    );
    const stats = await emailQueueService.getStats();
    res.json({
      status: "ok",
      emailQueue: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Error handling middleware (should be last)
app.use(errorHandler);

export default app;
