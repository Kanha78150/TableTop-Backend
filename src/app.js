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
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()), // 🔒
    credentials: true,
    methods: ["GET", "POST", "HEAD", "PUT", "PATCH", "DELETE"],
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(cookieParser());

// Session configuration for OAuth
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
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
