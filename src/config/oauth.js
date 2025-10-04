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
        const email = profile.emails[0].value;
        const googleId = profile.id;

        // Check if user already exists with this Google ID (returning user - LOGIN)
        let existingUser = await User.findOne({ googleId: googleId });

        if (existingUser) {
          // User exists with Google ID - this is a LOGIN scenario
          // Update profile picture if it has changed
          if (
            profile.photos[0]?.value &&
            existingUser.profileImage !== profile.photos[0].value
          ) {
            existingUser.profileImage = profile.photos[0].value;
            existingUser.googleProfile.picture = profile.photos[0].value;
            await existingUser.save();
          }

          // Add flag to indicate this is a login
          existingUser.isReturningUser = true;
          return done(null, existingUser);
        }

        // Check if user exists with same email but different auth provider
        existingUser = await User.findOne({ email: email });

        if (existingUser && !existingUser.googleId) {
          // User exists with email but hasn't used Google before - ACCOUNT LINKING
          existingUser.googleId = googleId;
          existingUser.authProvider = "google";
          existingUser.isOAuthUser = true;
          existingUser.isEmailVerified =
            profile._json.verified_email || existingUser.isEmailVerified;

          // Update profile image if user doesn't have one
          if (!existingUser.profileImage && profile.photos[0]?.value) {
            existingUser.profileImage = profile.photos[0].value;
          }

          existingUser.googleProfile = {
            picture: profile.photos[0]?.value || null,
            locale: profile._json.locale || null,
            verified_email: profile._json.verified_email || false,
          };

          await existingUser.save();

          // Add flag to indicate this is account linking
          existingUser.isAccountLinked = true;
          return done(null, existingUser);
        }

        // Create new user - SIGNUP scenario
        const newUser = new User({
          name: profile.displayName,
          email: email,
          googleId: googleId,
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

        // Add flag to indicate this is a new user signup
        newUser.isNewUser = true;
        return done(null, newUser);
      } catch (error) {
        console.error("Google OAuth Strategy Error:", error);
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
