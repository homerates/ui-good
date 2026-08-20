import { NextRequest, NextResponse } from 'next/server';
import { scoreL1, scoreL2, scoreL3, scoreL4, computeComposite, verdictLabel } from '../../../lib/scoring/decisionScore';

// ── POST /api/instant-score ────────────────────────────────────────────────────
// Partner-facing API: one call, full 4-level Decision Score + report URL.
//
// Request body:
//   { "address": "string"  }          — full street address
//   { "url": "string"      }          — Redfin/Zillow listing URL
//   { "scenario": { "down_pct": 20, "rate": 6.53, "loan_type": "conventional" } }  — optional
//
// Response:
//   {
//     "ok": true,
//     "composite": 72, "verdict": "Ready to Offer",
//     "scores": { "l1": 86, "l1_summary": "...", "l2": 58, ... },
//     "property": { "address": "...", "price": 4500000, "beds": 6, ... },
//     "report_url": "https://chat.homerates.ai/property-report?...",
//     "processing_ms": 4230
//   }

function calcL1(loanAmt: number, price: number, downPct: number, rate: number, loanType: string) {
  const { score, summary: baseSummary } = scoreL1({ downPct, loanType });
  return { score, summary: `${baseSummary} · ${rate.toFixed(2)}% rate` };
}

function calcL2(price: number, avm: number | null) {
  return scoreL2({ listPrice: price, avm });
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body        = await req.json() as { url?: string; address?: string; scenario?: { down_pct?: number; rate?: number; loan_type?: string } };
    const rawInput    = body.url ?? body.address ?? '';
    const downPct     = body.scenario?.down_pct ?? null;
    const rateOverride = body.scenario?.rate     ?? null;

    if (!rawInput) {
      return NextResponse.json({ ok: false, error: 'Provide "url" or "address" in the request body.' }, { status: 400 });
    }

    const origin = req.nextUrl.origin;

    // ── Step 1: property lookup ───────────────────────────────────────────────
    const lookupRes = await fetch(`${origin}/api/property/lookup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(
        rawInput.startsWith('http') ? { url: rawInput } : { address: rawInput }
      ),
    });
    if (!lookupRes.ok) {
      return NextResponse.json({ ok: false, error: 'Property not found.' }, { status: 404 });
    }
    const lookupJson = await lookupRes.json();
    if (!lookupJson.ok || !lookupJson.data?.address) {
      return NextResponse.json({ ok: false, error: 'Could not extract property data.' }, { status: 422 });
    }
    const d       = lookupJson.data as Record<string, unknown>;
    const address = d.address as string;
    const price   = (d.price as number) ?? 0;
    const liveRate = rateOverride ?? 6.875;
    const dp      = downPct ?? ((price > 832_750) ? 20 : 10);
    const loanAmt = price * (1 - dp / 100);
    const avm     = (d.estimatedValue as number | null) ?? null;
    const loanType = body.scenario?.loan_type ?? (loanAmt > 832_750 ? 'jumbo' : 'conventional');

    const l1   = calcL1(loanAmt, price, dp, liveRate, loanType);
    let l2raw  = calcL2(price, avm);

    // ── Step 2: Grok deep analysis (L3 + L4) ─────────────────────────────────
    const grokRes = await fetch(`${origin}/api/beta/grok-property`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        address,
        deep: true,
        redfin: {
          current_status:     d.listingStatus ?? 'FOR_SALE',
          current_list_price: price,
          bedrooms:           d.beds,
          bathrooms:          d.baths,
          sqft:               d.sqft,
          year_built:         d.yearBuilt,
          days_on_market:     d.daysOnMarket,
          last_sold_price:    d.lastSalePrice,
          last_sold_date:     d.lastSaleDate,
          tax_rate_effective: d.taxRateEffective,
          hoa_monthly:        d.hoaMonthly,
          photo_url:          d.photoUrl,
        },
      }),
    });

    let deepResult: Record<string, unknown> = {};
    if (grokRes.ok && grokRes.body) {
      const reader = grokRes.body.getReader();
      const dec    = new TextDecoder();
      let buf      = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(t.slice(6));
            if (ev.done && ev.result) deepResult = ev.result as Record<string, unknown>;
          } catch { /* partial */ }
        }
      }
    }

    // ── L2 final ─────────────────────────────────────────────────────────────
    let l2Score   = l2raw?.score ?? null;
    let l2Summary = l2raw?.summary ?? 'AVM data unavailable';
    if (l2Score == null) {
      const deepAvm = (deepResult.zillow_estimate as number | null) ?? (deepResult.redfin_estimate as number | null) ?? null;
      const l2deep  = calcL2(price, deepAvm);
      if (l2deep) { l2Score = l2deep.score; l2Summary = l2deep.summary; }
      else { l2Score = 65; l2Summary = 'AVM limited'; }
    }

    // ── L3 ───────────────────────────────────────────────────────────────────
    const dom = (deepResult.market_median_dom   as number | null) ?? null;
    const stlRaw = (deepResult.market_sale_to_list as number | null) ?? null;
    // Grok sometimes returns percent (100.2) instead of ratio (1.002) — a real ratio is never > 2
    const stl = stlRaw != null && stlRaw > 2 ? stlRaw / 100 : stlRaw;
    const sub = (deepResult.days_on_market      as number | null) ?? (d.daysOnMarket as number | null) ?? null;
    const spScore = (d.socialProofScore as number | null) ?? null;
    const spViews = (d.zillowViews     as number | null) ?? null;
    const spRank  = (d.redfinViews     as string | null) ?? null;

    const socialProofNotes: string[] = [];
    if (spViews != null) socialProofNotes.push(`${spViews.toLocaleString()} views`);
    if (spRank) socialProofNotes.push(spRank);
    const { score: l3Score, summary: l3SummaryRaw } = scoreL3({
      domMedian: dom, saleToList: stl, subjectDom: sub, socialProofScore: spScore, socialProofNotes,
    });
    // scoreL3 doesn't know this route's "S/L NN%" / "Nd on market" phrasing —
    // preserve it here rather than in the shared module (partner-facing text contract).
    const l3Parts: string[] = [];
    if (dom != null) l3Parts.push(`Median DOM ${dom}d`);
    if (stl != null) l3Parts.push(`S/L ${(stl * 100).toFixed(0)}%`);
    if (spViews != null) l3Parts.push(`${spViews.toLocaleString()} views`);
    if (spRank)  l3Parts.push(spRank);
    const l3Summary = l3Parts.join(' · ') || (sub != null ? `${sub}d on market` : l3SummaryRaw);

    // ── L4 ───────────────────────────────────────────────────────────────────
    const li = deepResult.location_intelligence as Record<string, unknown> | null;
    const l4Result = scoreL4({
      overallScore: (li?.overall_score as number | null) ?? null,
      subScores: (li?.sub_scores as { metric: string; rating: string }[]) ?? [],
    });
    const l4Score = l4Result?.score ?? null;
    const l4Summary = l4Result?.summary?.replace(/, /g, ' · ').replace(/\.$/, '') ?? '';

    // ── Composite ────────────────────────────────────────────────────────────
    const composite = computeComposite({ l1: l1.score, l2: l2Score, l3: l3Score, l4: l4Score });

    // ── Report URL ───────────────────────────────────────────────────────────
    const rp = new URLSearchParams({ address, down: String(dp), rate: liveRate.toFixed(3) });
    if (d.photoUrl) rp.set('photo', d.photoUrl as string);
    const report_url = `${origin}/property-report?${rp.toString()}`;

    return NextResponse.json({
      ok:             true,
      composite,
      verdict:        composite != null ? verdictLabel(composite) : null,
      scores: {
        l1:         l1.score,   l1_summary: l1.summary,
        l2:         l2Score,    l2_summary: l2Summary,
        l3:         l3Score,    l3_summary: l3Summary,
        l4:         l4Score,    l4_summary: l4Summary,
      },
      property: {
        address,
        price,
        beds:           (d.beds as number | null) ?? null,
        baths:          (d.baths as number | null) ?? null,
        sqft:           (d.sqft as number | null) ?? null,
        year_built:     (d.yearBuilt as number | null) ?? null,
        days_on_market: (d.daysOnMarket as number | null) ?? null,
        listing_status: (d.listingStatus as string | null) ?? null,
        photo_url:      (d.photoUrl as string | null) ?? null,
        social_proof_score: (d.socialProofScore as number | null) ?? null,
        interest_level: (d.interestLevel as string | null) ?? null,
      },
      scenario: { down_pct: dp, rate: liveRate, loan_type: loanType },
      report_url,
      instant_url: `${origin}/instant?address=${encodeURIComponent(address)}`,
      processing_ms: Date.now() - t0,
    });

  } catch (e) {
    console.error('[instant-score]', e);
    return NextResponse.json({ ok: false, error: 'Internal error — please try again.' }, { status: 500 });
  }
}
