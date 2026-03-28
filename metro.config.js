const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Watchman’s file map can disagree with the real filesystem on macOS (Desktop/iCloud,
// recrawl warnings). Metro then thinks packages like react/react-dom have no entry file.
config.resolver.useWatchman = false;

module.exports = config;
