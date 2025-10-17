import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/answers
 * Simple, deterministic endpoint for testing and echoing borrower/public queries.
 * Accepts POST { question, intent?, loanAmount? }
 */

export async function GET() {
  return NextResponse.json({
    ok: true,
    expects: "POST { question, intent?, loanAmount? }",
    example: { question: "What can I afford?", intent: "prequal", loanAmount: 750000 },
    note: "mode no longer required"
  });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const question = (body?.question ?? "").toString().trim();
  const intent = (body?.intent ?? "").toString().trim() || null;
  const loanAmount = Number(body?.loanAmount) || null;

  if (!question) {
    return NextResponse.json(
      { ok: false, error: "missing_question" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    msg: {
      tldr: ["Deterministic response.", "No external calls."],
      text: `Echo: ${question}`
    },
    meta: {
      path: "/api/answers",
      deterministic: true,
      sha: process.env.VERCEL_GIT_COMMIT_SHA || "dev-local",
      branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown"
    },
    echo: { question, intent, loanAmount }
  });
}
