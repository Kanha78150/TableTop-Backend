import crypto from "crypto";

/**
 * Generate a secure random token for password reset
 * @param {number} length - Length of the token (default: 32)
 * @returns {string} - Secure random token
 */
export const generateResetToken = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};

/**
 * Hash a token for secure storage in database
 * @param {string} token - Token to hash
 * @returns {string} - Hashed token
 */
export const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};
