/**
 * Generate a random 6-digit OTP
 * @returns {string} 6-digit OTP
 */
export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
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
