// app/api/version/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function first(...vals: (string | undefined)[]) {
  for (const v of vals) if (v && v.trim().length > 0) return v;
  return undefined;
}

export async function GET() {
  // Try multiple env keys; some projects expose different ones.
  const commit = first(
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    process.env.GIT_COMMIT_SHA,
    process.env.COMMIT_SHA
  ) ?? "unknown";

  const version = first(
    process.env.APP_VERSION,
    process.env.npm_package_version
  ) ?? "0.0.0";

  const builtAt =
    process.env.VERCEL_BUILD_TIME || new Date().toISOString();

  const envReport = {
    VERCEL_GIT_COMMIT_SHA: !!process.env.VERCEL_GIT_COMMIT_SHA,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: !!process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    GIT_COMMIT_SHA: !!process.env.GIT_COMMIT_SHA,
    COMMIT_SHA: !!process.env.COMMIT_SHA,
    APP_VERSION: !!process.env.APP_VERSION,
    npm_package_version: !!process.env.npm_package_version,
    VERCEL_BUILD_TIME: !!process.env.VERCEL_BUILD_TIME,
    VERCEL: !!process.env.VERCEL,
    NODE_ENV: process.env.NODE_ENV || "unknown",
  };

  const body = {
    meta: { path: "version", tag: "version-v2" as const },
    version,
    commit,
    builtAt,
    envReport,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
