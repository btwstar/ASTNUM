import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ASTNUM — Habits, Notes & Workouts",
    short_name: "ASTNUM",
    description:
      "Habits + notes & tasks + gym workouts with a muscle heat map — offline-first, 160 languages. عاداتك وملاحظاتك وتمارينك في تطبيق واحد.",
    id: "/",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "auto",
    lang: "en",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    categories: ["health", "fitness", "productivity", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
