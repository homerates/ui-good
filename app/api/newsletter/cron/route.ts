// app/api/newsletter/cron/route.ts
// GET — called by Vercel cron every Monday at 9am UTC
// Delegates to /api/newsletter/send

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${APP_URL}/api/newsletter/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({}),
  });

  const data = await res.json();
  console.log("[newsletter/cron]", data);
  return NextResponse.json(data, { status: res.status });
}
