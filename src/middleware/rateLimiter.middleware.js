/**
 * Rate Limiting Middleware
 * Protects API endpoints from excessive requests
 */

// Simple in-memory rate limiter (lightweight, no external dependencies)
const requestCounts = new Map();

/**
 * Creates a rate limiter middleware
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // max requests per window
    message = "Too many requests, please try again later.",
    skipSuccessfulRequests = false,
  } = options;

  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or initialize request log for this IP
    if (!requestCounts.has(key)) {
      requestCounts.set(key, []);
    }

    const requests = requestCounts.get(key);

    // Remove old requests outside the window
    const recentRequests = requests.filter((time) => time > windowStart);
    requestCounts.set(key, recentRequests);

    // Check if limit exceeded
    if (recentRequests.length >= max) {
      return res.status(429).json({
        success: false,
        message: message,
      });
    }

    // Add current request
    recentRequests.push(now);

    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      // 1% chance
      for (const [ip, times] of requestCounts.entries()) {
        const recent = times.filter((time) => time > windowStart);
        if (recent.length === 0) {
          requestCounts.delete(ip);
        } else {
          requestCounts.set(ip, recent);
        }
      }
    }

    next();
  };
};

// General API rate limiter
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});

// Stricter rate limiter for authentication endpoints
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message:
    "Too many authentication attempts, please try again after 15 minutes.",
});

// Rate limiter for payment operations (critical security)
export const paymentLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message:
    "Too many payment attempts. For security reasons, please wait 1 hour before trying again.",
});

// Rate limiter for webhook endpoints
export const webhookLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: "Too many webhook requests.",
});

// Rate limiter for OTP/verification endpoints
export const otpLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: "Too many OTP requests, please try again after 1 hour.",
});

// Rate limiter for registration/signup
export const signupLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: "Too many signup attempts. Please try again after 1 hour.",
});

// Rate limiter for password reset
export const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: "Too many password reset attempts. Please try again after 1 hour.",
});

// Rate limiter for file uploads
export const uploadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: "Too many upload attempts. Please try again after 15 minutes.",
});

// Rate limiter for search/query operations
export const searchLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: "Too many search requests. Please wait a minute.",
});

// Export all limiters
export default {
  generalLimiter,
  authLimiter,
  paymentLimiter,
  webhookLimiter,
  otpLimiter,
  signupLimiter,
  passwordResetLimiter,
  uploadLimiter,
  searchLimiter,
};
