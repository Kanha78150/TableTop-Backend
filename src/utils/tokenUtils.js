import jwt from "jsonwebtoken";

/**
 * generateTokens(user)
 * Accepts a user-like object with at least _id and role.
 * Returns { accessToken, refreshToken }.
 */
export const generateTokens = (user) => {
  const payload = { id: user._id.toString(), role: user.role };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_SECRET_EXPIRY,
  });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_SECRET_EXPIRY,
  });

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);
export const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);
