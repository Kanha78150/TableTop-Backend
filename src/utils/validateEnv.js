import { logger } from "./logger.js";

/**
 * Environment Variable Validator
 * Validates all required environment variables on application startup
 */

const requiredEnvVars = {
  // Server Configuration
  NODE_ENV: {
    required: true,
    description: "Environment mode",
    validValues: ["development", "production", "test"],
  },

  // Database
  MONGO_URI: { required: true, description: "MongoDB connection URI" },

  // JWT Configuration
  JWT_SECRET: {
    required: true,
    description: "JWT secret key",
    minLength: 32,
  },
  JWT_SECRET_EXPIRY: { required: true, description: "JWT expiry duration" },
  JWT_REFRESH_SECRET: {
    required: true,
    description: "JWT refresh secret key",
    minLength: 32,
  },
  JWT_REFRESH_SECRET_EXPIRY: {
    required: true,
    description: "JWT refresh token expiry",
  },

  // Cloudinary (Required for image uploads)
  CLOUDINARY_CLOUD_NAME: {
    required: true,
    description: "Cloudinary cloud name",
  },
  CLOUDINARY_API_KEY: { required: true, description: "Cloudinary API key" },
  CLOUDINARY_API_SECRET: {
    required: true,
    description: "Cloudinary API secret",
  },

  // Email Configuration
  EMAIL_USER: { required: true, description: "Email service user" },
  EMAIL_PASS: { required: true, description: "Email service password" },

  // Google OAuth
  GOOGLE_CLIENT_ID: { required: true, description: "Google OAuth client ID" },
  GOOGLE_CLIENT_SECRET: {
    required: true,
    description: "Google OAuth client secret",
  },
  GOOGLE_CALLBACK_URL: {
    required: true,
    description: "Google OAuth callback URL",
  },
  SESSION_SECRET: {
    required: true,
    description: "Session secret key",
    minLength: 32,
  },

  // Razorpay Payment Gateway (Platform credentials for Admin Subscriptions ONLY)
  // Note: User food orders use hotel-specific credentials from PaymentConfig database
  RAZORPAY_KEY_ID: {
    required: true,
    description: "Razorpay key ID (for admin subscription payments)",
    pattern: /^rzp_(test|live)_[a-zA-Z0-9]+$/,
  },
  RAZORPAY_KEY_SECRET: {
    required: true,
    description: "Razorpay key secret (for admin subscription payments)",
  },
  RAZORPAY_WEBHOOK_SECRET: {
    required: true,
    description: "Razorpay webhook secret (for admin subscription payments)",
  },

  // Frontend URL
  FRONTEND_URL: { required: true, description: "Frontend application URL" },

  // CORS
  CORS_ORIGIN: { required: true, description: "CORS allowed origins" },
};

const optionalEnvVars = {
  // Server Configuration (Cloud Run injects PORT automatically)
  PORT: { description: "Server port number", default: "8080" },

  // Twilio SMS (Optional - if SMS functionality is used)
  TWILIO_SID: { description: "Twilio account SID" },
  TWILIO_AUTH_TOKEN: { description: "Twilio auth token" },
  TWILIO_PHONE: { description: "Twilio phone number" },

  // Razorpay URLs (with defaults)
  RAZORPAY_REDIRECT_URL: { description: "Razorpay redirect callback URL" },
  RAZORPAY_WEBHOOK_URL: { description: "Razorpay webhook URL" },

  // Super Admin Configuration
  SUPER_ADMIN_MAX_OTP_ATTEMPTS: {
    description: "Maximum OTP attempts",
    default: "3",
  },
  SUPER_ADMIN_OTP_EXPIRY_MINUTES: {
    description: "OTP expiry in minutes",
    default: "10",
  },

  // Subscription Configuration
  SUBSCRIPTION_GRACE_PERIOD_DAYS: {
    description: "Subscription grace period",
    default: "3",
  },
  SUBSCRIPTION_REMINDER_DAYS: {
    description: "Subscription reminder days",
    default: "7,3,1",
  },

  // Background Jobs
  ENABLE_SUBSCRIPTION_JOBS: {
    description: "Enable subscription background jobs",
    default: "true",
  },
  ENABLE_EMAIL_QUEUE: {
    description: "Enable email queue processor",
    default: "true",
  },

  // Assignment System
  MAX_ORDERS_PER_WAITER: {
    description: "Maximum orders per waiter",
    default: "20",
  },
  MONITORING_INTERVAL: {
    description: "Monitoring interval in ms",
    default: "30000",
  },
  ORDER_TIMEOUT_MINUTES: {
    description: "Order timeout in minutes",
    default: "60",
  },
  CLEANUP_INTERVAL: {
    description: "Cleanup interval in ms",
    default: "3600000",
  },
  MAX_PREPARATION_TIME: {
    description: "Max preparation time in minutes",
    default: "45",
  },
  MAX_QUEUE_SIZE: { description: "Maximum queue size", default: "100" },
};

/**
 * Validates a single environment variable
 */
const validateEnvVar = (key, config, value) => {
  const errors = [];
  const warnings = [];

  // Check if required and missing
  if (config.required && !value) {
    errors.push(`${key} is required but not set. ${config.description}`);
    return { errors, warnings };
  }

  if (!value) {
    return { errors, warnings };
  }

  // Check minimum length
  if (config.minLength && value.length < config.minLength) {
    errors.push(
      `${key} must be at least ${config.minLength} characters long (current: ${value.length})`
    );
  }

  // Check pattern
  if (config.pattern && !config.pattern.test(value)) {
    errors.push(
      `${key} does not match required pattern. Expected format: ${config.pattern}`
    );
  }

  // Check valid values
  if (config.validValues && !config.validValues.includes(value)) {
    errors.push(
      `${key} must be one of: ${config.validValues.join(
        ", "
      )} (current: ${value})`
    );
  }

  // Warnings for production
  if (process.env.NODE_ENV === "production") {
    if (key === "CORS_ORIGIN" && value === "*") {
      warnings.push(
        "⚠️  CORS_ORIGIN is set to '*' in production. This is a security risk!"
      );
    }

    if (key === "RAZORPAY_KEY_ID" && value.startsWith("rzp_test_")) {
      warnings.push(
        "⚠️  Using Razorpay TEST keys in production environment! Switch to LIVE keys."
      );
    }

    if (
      key.includes("URL") &&
      (value.includes("localhost") || value.includes("127.0.0.1"))
    ) {
      warnings.push(
        `⚠️  ${key} contains localhost URL in production: ${value}`
      );
    }
  }

  return { errors, warnings };
};

/**
 * Main validation function
 */
export const validateEnvironment = () => {
  const errors = [];
  const warnings = [];
  const missing = [];

  logger.info("🔍 Validating environment variables...");

  // Validate required variables
  Object.entries(requiredEnvVars).forEach(([key, config]) => {
    const value = process.env[key];
    const { errors: varErrors, warnings: varWarnings } = validateEnvVar(
      key,
      config,
      value
    );

    errors.push(...varErrors);
    warnings.push(...varWarnings);
  });

  // Check optional variables with defaults
  Object.entries(optionalEnvVars).forEach(([key, config]) => {
    const value = process.env[key];
    if (!value && config.default) {
      process.env[key] = config.default;
      logger.info(`✓ ${key} not set, using default: ${config.default}`);
    }
  });

  // Production-specific validations
  if (process.env.NODE_ENV === "production") {
    // Check for example/placeholder values
    const placeholderPatterns = [
      /your[_-]?/i,
      /example/i,
      /placeholder/i,
      /changeme/i,
      /todo/i,
    ];

    Object.entries(requiredEnvVars).forEach(([key, config]) => {
      const value = process.env[key];
      if (value && placeholderPatterns.some((pattern) => pattern.test(value))) {
        errors.push(
          `${key} appears to contain a placeholder value in production: "${value}"`
        );
      }
    });
  }

  // Report results
  if (errors.length > 0) {
    logger.error("❌ Environment validation failed:");
    errors.forEach((error) => logger.error(`   ${error}`));
    logger.error(
      "\n💡 Tip: Check your .env file and compare with .env.example"
    );
    return false;
  }

  if (warnings.length > 0) {
    logger.warn("⚠️  Environment validation warnings:");
    warnings.forEach((warning) => logger.warn(`   ${warning}`));
  }

  logger.info("✅ Environment validation passed");
  return true;
};

/**
 * Print environment summary (safe for logs)
 */
export const printEnvironmentSummary = () => {
  const safeSummary = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    MONGO_URI: process.env.MONGO_URI
      ? `${process.env.MONGO_URI.substring(0, 20)}...`
      : "NOT SET",
    RAZORPAY_MODE: process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")
      ? "TEST"
      : "LIVE",
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    FRONTEND_URL: process.env.FRONTEND_URL,
    EMAIL_QUEUE: process.env.ENABLE_EMAIL_QUEUE,
    SUBSCRIPTION_JOBS: process.env.ENABLE_SUBSCRIPTION_JOBS,
  };

  logger.info("📋 Environment Configuration:");
  Object.entries(safeSummary).forEach(([key, value]) => {
    logger.info(`   ${key}: ${value}`);
  });
};

export default {
  validateEnvironment,
  printEnvironmentSummary,
};
