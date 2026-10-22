import type { CapacitorConfig } from "@capacitor/cli";

/**
 * ASTNUM Android wrapper.
 * webDir 'www' is filled by scripts/build-apk.sh (static export of the web app
 * with the in-browser local-api adapter active — fully offline).
 */
const config: CapacitorConfig = {
  appId: "app.astnum.mobile",
  appName: "ASTNUM",
  webDir: "www",
  version: "1.24",
  android: {
    allowMixedContent: false,
    backgroundColor: "#0b1020",
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
