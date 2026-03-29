const path = require("path");
const { loadProjectEnv } = require("@expo/env");

// Load .env / .env.local into process.env before reading EXPO_PUBLIC_* (same as Metro)
loadProjectEnv(path.resolve(__dirname), { silent: true });

const appJson = require("./app.json");

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      geminiApiKey: (process.env.EXPO_PUBLIC_GEMINI_API_KEY || "").trim(),
    },
  },
};
