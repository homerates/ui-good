// src/lib/normalize.ts

/** Turn any LLM blob into: one-line takeaway, compact bullets, and 2 Next: steps. */
export function normalizeConceptAnswer(raw: string): string {
  let txt = String(raw ?? "");

  // Strip markdown headings and bold
  txt = txt.replace(/^#+\s*/gm, "");
  txt = txt.replace(/\*\*(.*?)\*\*/g, "$1");

  // Normalize bullet markers to "â€¢ "
  txt = txt.replace(/^\s*-\s+/gm, "â€¢ ");
  txt = txt.replace(/^\s*â€¢\s*/gm, "â€¢ ");

  // Collapse whitespace
  txt = txt.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();

  // Ensure we have a clear takeaway line at top
  const lines = txt.split("\n").map(s => s.trim()).filter(Boolean);
  let takeaway = lines.shift() || "Takeaway: hereâ€™s the concept in plain English.";
  if (!/^takeaway:/i.test(takeaway)) {
    takeaway = "Takeaway: " + takeaway.replace(/^[-â€¢]\s*/, "");
  }

  // Collect up to 5 bullets (lines that start with bullet)
  const bullets = lines.filter(l => /^[-â€¢]\s*/.test(l)).map(l => l.replace(/^[-â€¢]\s*/, "")).slice(0, 5);

  // Extract existing Next steps if present
  const nextLines = lines.filter(l => /^next:/i.test(l)).map(l => l.replace(/^next:\s*/i, ""));

  // Guarantee exactly 2 Next steps
  const defaults = [
    "Gather income docs + monthly debts to estimate your DTI.",
    "Adjust target payment or down payment until DTI lands in a comfortable range."
  ];
  const next = (nextLines.concat(defaults)).slice(0, 2);

  const out: string[] = [];
  out.push(takeaway, "");
  if (bullets.length) {
    out.push("â€¢ " + bullets.join("\nâ€¢ "), "");
  }
  out.push("Next: " + next[0]);
  out.push("Next: " + next[1]);
  return out.join("\n");
}

