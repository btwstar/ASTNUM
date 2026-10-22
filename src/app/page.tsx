"use client";

import dynamic from "next/dynamic";

// ASTNUM — single-route app shell (all screens are client-side tabs/overlays)
const AppShell = dynamic(() => import("@/components/shell/app-shell").then((m) => m.AppShell), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <span className="text-gradient text-2xl font-bold tracking-tight">ASTNUM</span>
    </div>
  ),
});

export default function Home() {
  return <AppShell />;
}
