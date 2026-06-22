// app/api/market-rates-digest/cron/route.ts
// GET — Vercel cron: Mon–Fri 13:00 UTC (8am ET / 9am ET DST)
// Delegates to /api/market-rates-digest POST

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://chat.homerates.ai";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${APP_URL}/api/market-rates-digest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({}),
  });

  const data = await res.json();
  console.log("[market-rates-digest/cron]", data);
  return NextResponse.json(data, { status: res.status });
}
