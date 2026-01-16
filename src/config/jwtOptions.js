export const CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  path: "/",
};

export const AccessTokenCookieOptions = {
  ...CookieOptions,
  maxAge: 30 * 60 * 1000, // 30 minutes
};

export const RefreshTokenCookieOptions = {
  ...CookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
