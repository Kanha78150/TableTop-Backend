export const CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // Set to true in production
  sameSite: "Lax", // Adjust based on your needs (Lax, Strict, None)
};
