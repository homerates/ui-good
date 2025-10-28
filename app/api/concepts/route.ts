// app/api/concepts/route.ts
import { NextResponse } from "next/server";

type Meta = { path: "concepts"; tag: "concepts-v1"; matched?: string };
type Answer = { meta: Meta; tlDr: string; bullets: string[]; notes?: string[] };

const LOWER = (s: string) => s.toLowerCase();

function answerFor(query: string): Answer | null {
  const q = LOWER(query);

  // --- DTI ---
  if (/(^| )dti( |$)|debt[- ]?to[- ]?income|debt to income/.test(q)) {
    return {
      meta: { path: "concepts", tag: "concepts-v1", matched: "dti" },
      tlDr:
        "DTI is your monthly debt payments ÷ gross monthly income. Caps vary by program and AUS findings.",
      bullets: [
        "Conventional (CA): AUS often approves to ~50% back-end with strong factors; baseline ~45%.",
        "FHA: Manual 31/43 guide; AUS routinely approves higher (high-40s/low-50s) with strengths.",
        "VA: No hard DTI cap — residual income test rules. 41% is a reference, not a ceiling.",
        "USDA: Guide 29/41; GUS may allow higher with compensating factors.",
        "Jumbo (investor-specific): many cap ~43%; some allow 45–47% with reserves/credit depth.",
        "Back-end DTI = (housing PITI + other monthly debts) / gross monthly income.",
      ],
      notes: [
        "California only; actual approval depends on AUS/underwriter and lender overlays.",
        "Student loans, alimony/child support, and HELOCs can change what counts in debts.",
      ],
    };
  }

  // --- PMI / MI ---
  if (/\b(pmi|mi|mortgage insurance)\b/.test(q)) {
    return {
      meta: { path: "concepts", tag: "concepts-v1", matched: "pmi" },
      tlDr:
        "PMI/MI protects the lender when LTV is high. Conventional MI can cancel; FHA’s MIP mostly sticks unless you refi.",
      bullets: [
        "Conventional: MI generally required when LTV > 80%; may auto-cancel at ~78% per schedule; borrower-requested at 80%.",
        "FHA: 3.5% down usually means life-of-loan MIP unless you refi out; larger down can shorten MIP.",
        "Price vs MI trade: sometimes a slightly higher rate with no MI beats a low rate with MI — run both.",
      ],
    };
  }

  // --- Points / Credits ---
  if (/\b(points?|discount points?|seller credit|concessions?)\b/.test(q)) {
    return {
      meta: { path: "concepts", tag: "concepts-v1", matched: "points-credits" },
      tlDr:
        "Points buy the rate down; lender/seller credits buy closing costs down. Compare breakeven vs your time horizon.",
      bullets: [
        "Breakeven = (cost of points) ÷ (monthly savings). If you’ll sell/refi before breakeven, don’t buy.",
        "Seller credits cap by program/occupancy; often best used for buydowns or fixed costs (escrows, title).",
        "Always compare: price reduction vs equal-value seller credit — credit often wins for payment.",
      ],
    };
  }

  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const hit = answerFor(q);
  if (hit) return NextResponse.json(hit, { status: 200 });

  return NextResponse.json(
    {
      meta: { path: "concepts", tag: "concepts-v1" as const },
      tlDr: "No local concept matched. Try program name or use the web answers route.",
      bullets: [],
    },
    { status: 200 }
  );
}
