"use client";

import { useState } from "react";

type ApiOut = {
  ok?: boolean;
  path?: string;
  usedFRED?: boolean;
  summary?: string;
  message?: string;
  fred?: { tenYearYield?: number; mort30Avg?: number; spread?: number; asOf?: string };
  confidence?: string;
  status?: number;
};

export default function Probe() {
  const [out, setOut] = useState<ApiOut | null>(null);
  const [text, setText] = useState<string>("");

  async function run() {
    setOut(null);
    setText("…");
    const r = await fetch("/api/answers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "market" }),
    });
    const j: ApiOut = await r.json();
    setOut(j);
    const line =
      j.message ??
      j.summary ??
      (j.fred
        ? `As of ${j.fred.asOf}: 10Y ${j.fred.tenYearYield?.toFixed(2)}%, 30Y ${j.fred.mort30Avg?.toFixed(2)}%, spread ${j.fred.spread?.toFixed(2)}%.`
        : `path: ${j.path} · usedFRED: ${j.usedFRED} · confidence: ${j.confidence}`);
    setText(line);
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Market Probe</h1>
      <button
        onClick={run}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        Get Market Summary
      </button>

      <div className="rounded border p-4">
        <div className="font-mono text-sm whitespace-pre-wrap">{text || "—"}</div>
      </div>

      <details className="rounded border p-4">
        <summary className="cursor-pointer">Raw JSON</summary>
        <pre className="mt-2 overflow-auto text-sm">{JSON.stringify(out, null, 2)}</pre>
      </details>
    </main>
  );
}
