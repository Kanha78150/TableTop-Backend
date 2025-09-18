import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../models/User.model.js";

// Load environment variables
dotenv.config();

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:8000/api/v1/auth/user/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists with this Google ID
        let existingUser = await User.findOne({ googleId: profile.id });

        if (existingUser) {
          // User exists, return user
          return done(null, existingUser);
        }

        // Check if user exists with same email
        existingUser = await User.findOne({ email: profile.emails[0].value });

        if (existingUser) {
          // Link Google account to existing user
          existingUser.googleId = profile.id;
          existingUser.authProvider = "google";
          existingUser.isOAuthUser = true;
          existingUser.googleProfile = {
            picture: profile.photos[0]?.value || null,
            locale: profile._json.locale || null,
            verified_email: profile._json.verified_email || false,
          };
          await existingUser.save();
          return done(null, existingUser);
        }

        // Create new user
        const newUser = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          authProvider: "google",
          isOAuthUser: true,
          profileImage: profile.photos[0]?.value || null,
          isEmailVerified: profile._json.verified_email || false,
          googleProfile: {
            picture: profile.photos[0]?.value || null,
            locale: profile._json.locale || null,
            verified_email: profile._json.verified_email || false,
          },
        });

        await newUser.save();
        return done(null, newUser);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
