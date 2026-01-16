import crypto from "crypto";

/**
 * Generate a cryptographically secure random 6-digit OTP
 * @returns {string} 6-digit OTP
 */
export const generateOtp = () => {
  // Generate a cryptographically secure random number between 100000 and 999999
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Hash OTP before storing in database
 * @param {string} otp - Plain OTP to hash
 * @returns {string} Hashed OTP
 */
export const hashOtp = (otp) => {
  // Guard against malformed input
  if (!otp || typeof otp !== "string" || otp.trim().length === 0) {
    throw new Error("Invalid OTP: must be a non-empty string");
  }
  return crypto.createHash("sha256").update(otp).digest("hex");
};

/**
 * Verify OTP by comparing hashed values
 * @param {string} plainOtp - Plain OTP from user input
 * @param {string} hashedOtp - Hashed OTP from database
 * @returns {boolean} true if OTP matches, false otherwise
 */
export const verifyOtp = (plainOtp, hashedOtp) => {
  try {
    // Guard against malformed or missing input
    if (
      !plainOtp ||
      typeof plainOtp !== "string" ||
      plainOtp.trim().length === 0
    ) {
      return false;
    }

    if (
      !hashedOtp ||
      typeof hashedOtp !== "string" ||
      hashedOtp.length !== 64
    ) {
      // SHA-256 hex string is always 64 characters
      return false;
    }

    const hashedInput = hashOtp(plainOtp);

    // timingSafeEqual requires buffers of equal length
    // Both should be 64 hex chars (32 bytes) after SHA-256
    const bufferInput = Buffer.from(hashedInput, "hex");
    const bufferStored = Buffer.from(hashedOtp, "hex");

    // Additional safety check for buffer lengths
    if (bufferInput.length !== bufferStored.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferInput, bufferStored);
  } catch (error) {
    // Safety net: any error in verification returns false
    console.error("OTP verification error:", error.message);
    return false;
  }
};

/**
 * Check if OTP is expired
 * @param {Date} expiryDate - OTP expiry date
 * @returns {boolean} true if expired, false otherwise
 */
export const isOtpExpired = (expiryDate) => {
  if (!expiryDate) return true;
  return new Date() > new Date(expiryDate);
};

/**
 * Generate OTP expiry time
 * @param {number} minutes - Minutes until expiry (default: 10)
 * @returns {Date} Expiry date
 */
export const generateOtpExpiry = (minutes = 10) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};
