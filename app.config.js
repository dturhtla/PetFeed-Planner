const path = require("path");
const { loadProjectEnv } = require("@expo/env");

// Load .env / .env.local into process.env before reading EXPO_PUBLIC_* (same as Metro)
loadProjectEnv(path.resolve(process.cwd()), { silent: true });

const appJson = require("./app.json");

/** Used by native builds (prebuild / run:ios / run:android). Must match App Store / Play identifiers if you publish. */
const BUNDLE_ID = "com.khantkoko.petapp";

module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...(appJson.expo.ios || {}),
      bundleIdentifier: BUNDLE_ID,
    },
    android: {
      ...(appJson.expo.android || {}),
      package: BUNDLE_ID,
    },
    extra: {
      ...(appJson.expo.extra || {}),
      geminiApiKey: (process.env.EXPO_PUBLIC_GEMINI_API_KEY || "").trim(),
    },
  },
};
