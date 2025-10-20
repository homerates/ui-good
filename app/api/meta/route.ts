// app/api/meta/route.ts
import { NextResponse } from "next/server";
// Node runtime so fs/json imports are fine
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Static import â€” safer than dynamic import for Turbopack
import pkg from "../../../package.json"; // tsconfig: "resolveJsonModule": true

type MetaPayload = {
  name: string;
  version?: string;
  deps: { next?: string };
  env: { gitSha: string; gitBranch: string };
  ts: string;
};

export async function GET() {
  const payload: MetaPayload = {
    name: pkg?.name ?? "homerates-ui-next",
    version: pkg?.version,
    deps: { next: pkg?.dependencies?.next },
    env: {
      gitSha:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.NEXT_PUBLIC_GIT_SHA ||
        "dev-local",
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
    },
    ts: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// push-proof

