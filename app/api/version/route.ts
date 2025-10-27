// app/api/version/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const payload = {
    meta: { path: "version", tag: "version-v2" },
    version: process.env.APP_VERSION || "0.0.0",
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
    builtAt: process.env.VERCEL_BUILD_TIME || new Date().toISOString()
  };
  return NextResponse.json(payload, { status: 200 });
}
