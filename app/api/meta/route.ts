import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    env: {
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA || "dev-local",
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF || "unknown"
    },
    ts: new Date().toISOString()
  });
}
