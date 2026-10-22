import type { NextConfig } from "next";

/**
 * ASTNUM Next config.
 *
 * Two build modes:
 *  - default (dev / web server): standalone output + full API routes.
 *  - APK static export: BUILD_MODE=apk NEXT_PUBLIC_STATIC=1
 *      → `output: "export"` + `out/` directory with the client-only build.
 *        The API layer is replaced at runtime by the in-browser adapter
 *        (src/lib/local-api) — see scripts/build-apk.sh which temporarily
 *        moves src/app/api aside during the export build.
 */
const isApkExport = process.env.BUILD_MODE === "apk";

const nextConfig: NextConfig = {
  ...(isApkExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : { output: "standalone" as const }),
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    // Barrel-file tree-shaking: shrinks the client bundle by importing only
    // the used icons/motion primitives instead of the whole package index.
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
