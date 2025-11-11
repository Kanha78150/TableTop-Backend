import jwt from "jsonwebtoken";

/**
 * Generate JWT tokens (access and refresh)
 * @param {Object} user - User object with _id, email, and role
 * @returns {Object} { accessToken, refreshToken }
 */
export const generateTokens = (user) => {
  const payload = {
    _id: user._id?.toString() || user.id?.toString(),
    email: user.email,
    role: user.role,
  };

  const accessToken = jwt.sign(
    payload,
    process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.JWT_ACCESS_EXPIRY || process.env.JWT_SECRET_EXPIRY || "15m",
    }
  );

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn:
      process.env.JWT_REFRESH_EXPIRY ||
      process.env.JWT_REFRESH_SECRET_EXPIRY ||
      "7d",
  });

  return { accessToken, refreshToken };
};

/**
 * Verify access token
 * @param {string} token - JWT access token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET
    );
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Access token has expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid access token");
    }
    throw error;
  }
};

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Refresh token has expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid refresh token");
    }
    throw error;
  }
};

/**
 * Verify token (generic)
 * @param {string} token - JWT token
 * @param {string} type - "access" or "refresh"
 * @returns {Object} Decoded token payload
 */
export const verifyToken = (token, type = "access") => {
  const secret =
    type === "access"
      ? process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET
      : process.env.JWT_REFRESH_SECRET;

  try {
    return jwt.verify(token, secret);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error(
        `${type === "access" ? "Access" : "Refresh"} token has expired`
      );
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error(`Invalid ${type} token`);
    }
    throw error;
  }
};

/**
 * Decode token without verification (useful for expired tokens)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} true if expired, false otherwise
 */
export const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch (error) {
    return true;
  }
};
