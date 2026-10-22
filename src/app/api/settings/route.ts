import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/settings → all settings as Record<string,string> */
export async function GET() {
  try {
    const rows = await db.settings.findMany();
    const entries: Record<string, string> = {};
    for (const row of rows) entries[row.key] = row.value;
    return NextResponse.json({ ok: true, data: entries });
  } catch (e) {
    console.error("settings GET error", e);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "failed to load settings" } },
      { status: 500 }
    );
  }
}

/** POST /api/settings { entries: Record<string,string> } → upsert many */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { entries?: Record<string, string> };
    if (!body.entries || typeof body.entries !== "object") {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "entries object required" } },
        { status: 400 }
      );
    }
    const now = new Date().toISOString();
    const upserts = Object.entries(body.entries).map(([key, value]) =>
      db.settings.upsert({
        where: { key },
        create: { key, value: String(value), updatedAt: now },
        update: { value: String(value), updatedAt: now },
      })
    );
    await db.$transaction(upserts);
    return NextResponse.json({ ok: true, data: { saved: upserts.length } });
  } catch (e) {
    console.error("settings POST error", e);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "failed to save settings" } },
      { status: 500 }
    );
  }
}
