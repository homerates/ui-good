// app/api/rate-intelligence/route.ts
// GET  — aggregates FRED series + computes meta stats
// POST — Grok Oracle streaming for chip interactions

import { NextRequest } from 'next/server';
import { getRange, getLatest, getSnapshot } from '../../../lib/market-data';
import { CONFORMING_OBMMI_SERIES_IDS, OBMMI_CITATION } from '../../../lib/market-data/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RatePoint { date: string; value: number; }

export interface RateIntelData {
  current: {
    rate30y:     number;
    rate15y:     number;
    rate10y:     number;
    fedFunds:    number;
    cpi:         number;
    lastUpdated: string;
  };
  series: {
    weekly30y:   RatePoint[];  // 52 weeks
    historical30y: RatePoint[]; // 5 years weekly
    weekly15y:   RatePoint[];
    weekly10y:   RatePoint[];  // daily DGS10 past 52 weeks
    monthlyFed:  RatePoint[];
    monthlyCpi:  RatePoint[];
  };
  meta: {
    week52High:  number;
    week52Low:   number;
    ytdStart:    number;
    ytdChange:   number;
    fromPeak:    number;
    allTimePeak: number;
    spread:      number;  // 30y minus 10y in bps * 100
  };
  // AD-11 Seam 4b: real OBMMI/segment data, current-value only (no historical
  // windows -- nothing on this page charts these individually today; see
  // Seam 4 design phase for the reasoning). arm5y1 (MORTGAGE5US) is grouped
  // here for display purposes (also "rate by loan program") but is NOT
  // OBMMI-sourced -- `citation` covers jumbo/fha/va/usda/conventional* only.
  byProgram: {
    jumbo: number | null;
    fha: number | null;
    va: number | null;
    usda: number | null;
    arm5y1: number | null;
    conventionalBestTier: number | null;
    conventionalRange: { min: number; max: number } | null;
    asOf: string | null;
    citation: string;
  };
}

// ── FRED helpers ──────────────────────────────────────────────────────────────
// AD-11 Seam 2: was 7 direct FRED fetches via a local fredUrl()/fetchSeries();
// now reads Market Data Service's persisted history — same 7 windows, same
// output shape (RatePoint[] = {date, value}), no live FRED call at request time.

const FALLBACKS = { rate30y: 6.82, rate15y: 6.21, rate10y: 4.26, fedFunds: 4.50, cpi: 3.1 };

async function toRatePoints(seriesId: string, start: string): Promise<RatePoint[]> {
  const obs = await getRange(seriesId, { start });
  return obs
    .filter(o => o.value !== null)
    .map(o => ({ date: o.observationDate, value: o.value as number }));
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fiveYearsAgo = '2021-01-01';
  const ytdStart = `${new Date().getFullYear()}-01-01`;

  const [
    series30y,
    hist30y,
    series15y,
    series10y,
    seriesFed,
    seriesCpi,
    ytd30yFull,
  ] = await Promise.all([
    toRatePoints('MORTGAGE30US', oneYearAgo),
    toRatePoints('MORTGAGE30US', fiveYearsAgo),
    toRatePoints('MORTGAGE15US', oneYearAgo),
    toRatePoints('DGS10', oneYearAgo),
    toRatePoints('FEDFUNDS', oneYearAgo),
    toRatePoints('CPIAUCSL', oneYearAgo),
    toRatePoints('MORTGAGE30US', ytdStart),
  ]);
  // Original fetch used limit=2 (first 2 observations from YTD start) purely
  // to grab the YTD-start value cheaply from a live API; a DB read has no
  // such cost, so this just takes the same first element from the full range.
  const ytd30y = ytd30yFull.slice(0, 2);

  // AD-11 Seam 4b: byProgram -- current value only for each flagship OBMMI
  // series, plus arm5y1 (MORTGAGE5US, NOT OBMMI). One getSnapshot covers all
  // 10 conforming segments at once for the best-tier value and min/max range.
  const [jumboObs, fhaObs, vaObs, usdaObs, arm5y1Obs, conventionalSnapshot] = await Promise.all([
    getLatest('OBMMIJUMBO30YF'),
    getLatest('OBMMIFHA30YF'),
    getLatest('OBMMIVA30YF'),
    getLatest('OBMMIUSDA30YF'),
    getLatest('MORTGAGE5US'),
    getSnapshot(CONFORMING_OBMMI_SERIES_IDS),
  ]);

  const conventionalValues = Object.values(conventionalSnapshot)
    .map(o => o?.value)
    .filter((v): v is number => v != null);
  const conventionalRange = conventionalValues.length
    ? { min: Math.min(...conventionalValues), max: Math.max(...conventionalValues) }
    : null;

  const byProgram: RateIntelData['byProgram'] = {
    jumbo: jumboObs?.value ?? null,
    fha: fhaObs?.value ?? null,
    va: vaObs?.value ?? null,
    usda: usdaObs?.value ?? null,
    arm5y1: arm5y1Obs?.value ?? null,
    conventionalBestTier: conventionalSnapshot['OBMMIC30YFLVLE80FGE740']?.value ?? null,
    conventionalRange,
    asOf: jumboObs?.observationDate ?? null,
    citation: OBMMI_CITATION,
  };

  // Current values — latest non-null observation
  const cur30y  = series30y.at(-1)?.value  ?? FALLBACKS.rate30y;
  const cur15y  = series15y.at(-1)?.value  ?? FALLBACKS.rate15y;
  const cur10y  = series10y.at(-1)?.value  ?? FALLBACKS.rate10y;
  const curFed  = seriesFed.at(-1)?.value  ?? FALLBACKS.fedFunds;
  const curCpi  = seriesCpi.at(-1)?.value  ?? FALLBACKS.cpi;
  const lastDate = series30y.at(-1)?.date  ?? new Date().toISOString().slice(0, 10);

  // Meta stats
  const vals30y = series30y.map(p => p.value);
  const week52High = vals30y.length ? Math.max(...vals30y) : FALLBACKS.rate30y;
  const week52Low  = vals30y.length ? Math.min(...vals30y) : FALLBACKS.rate30y;
  const ytdStart30y = ytd30y[0]?.value ?? cur30y;
  const ytdChange   = parseFloat((cur30y - ytdStart30y).toFixed(2));
  const allTimePeak = 18.63; // Oct 1981 — FRED MORTGAGE30US historical high
  const fromPeak    = parseFloat((cur30y - week52High).toFixed(2));
  const spread      = parseFloat(((cur30y - cur10y) * 100).toFixed(0)); // bps

  // YoY CPI change from monthly series (latest vs ~12 months ago)
  const cpiYoY = (() => {
    if (seriesCpi.length < 2) return null;
    const latest = seriesCpi.at(-1)!.value;
    const yearAgo = seriesCpi[0].value;
    return parseFloat(((latest / yearAgo - 1) * 100).toFixed(2));
  })();

  const data: RateIntelData = {
    current: { rate30y: cur30y, rate15y: cur15y, rate10y: cur10y, fedFunds: curFed, cpi: cpiYoY ?? curCpi, lastUpdated: lastDate },
    series: {
      weekly30y:    series30y,
      historical30y: hist30y,
      weekly15y:    series15y,
      weekly10y:    series10y,
      monthlyFed:   seriesFed,
      monthlyCpi:   seriesCpi,
    },
    meta: { week52High, week52Low, ytdStart: ytdStart30y, ytdChange, fromPeak, allTimePeak, spread },
    byProgram,
  };

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
    },
  });
}

// ── POST — Grok Oracle streaming ──────────────────────────────────────────────

// Hard grounding rule injected as system message on every call
const GROUNDING_SYSTEM = `You are the HomeRates.ai Rate Oracle — a sharp, data-driven mortgage market analyst.

HARD RULES — follow without exception:
1. Every specific number (rates, spreads, Fed Funds level, CPI, Treasury yield, probabilities, basis points) you write must come directly from the LIVE FRED DATA provided. Never substitute values from your training knowledge.
2. All future timelines, Fed meeting projections, cut forecasts, and rate-drop scenarios must be calculated forward from TODAY'S DATE (provided in the data). Never reference 2024 or 2025 dates as future events.
3. The MBS spread is computed as: 30Y Mortgage Rate minus 10Y Treasury × 100 = basis points. Derive it from the provided numbers.
4. If you are uncertain about a number that isn't in the data, say "not in live data" — never invent a figure.
5. Write in present tense anchored to today's date. This analysis will be read in real time.`;

const CHIP_PROMPTS: Record<string, (ctx: string) => string> = {
  initial: (ctx) => `Live FRED data as of today:
${ctx}

Write a concise, high-quality market intelligence brief in 2-3 short paragraphs. Cover:
1. Current rate environment and what's driving it — use the exact numbers above (MBS spread derived from 30Y minus 10Y, inflation, Fed Funds)
2. What buyers and homeowners should know right now given these specific levels
3. Strategic signal — bullish, bearish, or neutral? Anchor your reasoning to the 52-week range position.

End your response with exactly this line:
<<<TAGS:TagOne,TagTwo,TagThree,TagFour,TagFive>>>

Tags should be 2-3 word market signals reflecting the actual data. Be authoritative and specific.`,

  'fed-impact': (ctx) => `Live FRED data as of today:
${ctx}

Explain how Federal Reserve policy is flowing through to mortgage rates right now. Use only the figures provided:
1. The Fed Funds → 10Y Treasury → Mortgage Rate transmission mechanism — cite actual values from the data
2. Current MBS spread dynamics (compute from 30Y minus 10Y) and what this spread level signals
3. What upcoming FOMC decisions mean for borrowers given current Fed Funds and CPI levels

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>
Be specific and analytical. All numbers must match the live data.`,

  'lock-window': (ctx) => `Live FRED data as of today:
${ctx}

Provide a strategic rate lock recommendation grounded entirely in the data above:
1. Where does the current 30Y rate sit within the 52-week range? Calculate the percentile position.
2. Float vs lock risk/reward given current MBS spread (30Y minus 10Y × 100 bps) and rate trend
3. Float-down option strategy for buyers under contract at these levels
4. Specific lock/float recommendation with a data-backed rationale

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>`,

  'rate-drop': (ctx) => `Live FRED data as of today:
${ctx}

Analyze when and how much rates could fall from current levels. Base ALL projections on today's date and the live data — no 2024 or 2025 references as future dates:
1. What 10Y Treasury and MBS spread conditions must be true for the 30Y rate to reach 6.5%, 6.0%, and 5.5%
2. Fed cut timeline and magnitude needed starting from the current Fed Funds rate — project forward from today
3. Inflation trajectory required from current CPI level to support each rate target
4. Realistic probability and timeframe from today's date

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>`,

  // AD-11 Seam 4d: was "estimate 5/1 ARM based on typical spread to Fed
  // Funds" -- MORTGAGE5US ("5/1 ARM Rate" in the data above) has been real,
  // synced data the whole time; this route just never fetched it before.
  'arm-vs-fixed': (ctx) => `Live FRED data as of today:
${ctx}

Compare ARM vs 30Y Fixed using today's actual rate environment:
1. Current 30Y Fixed rate and the current 5/1 ARM Rate, both from the data above — do not estimate the ARM rate, cite the real figure provided
2. Break-even analysis: how many years before the 30Y fixed holder comes out ahead, using the actual rate gap between the two figures above?
3. Who should consider an ARM right now given current levels and the 52-week range?
4. Rate cap risk if an ARM is held past 5 years given current Fed Funds trajectory

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>`,

  // AD-11 Seam 4d: was "estimate from the 30Y rate and typical bank
  // portfolio dynamics" -- the real Jumbo 30Y Rate (OBMMI) is now in the
  // data above; the premium is a direct subtraction, not an estimate.
  jumbo: (ctx) => `Live FRED data as of today:
${ctx}

Analyze the Jumbo mortgage rate environment using the live data:
1. Jumbo vs conforming rate premium — compute directly as (Jumbo 30Y Rate) minus (30Y Fixed Rate) from the data above. Do not estimate this; both figures are provided.
2. How Jumbo pricing is affected differently by Fed policy vs MBS market given current spread levels
3. Which loan size tiers benefit most from Jumbo at today's rate levels?
4. Bank portfolio lending dynamics in the current Fed Funds environment

End with: <<<TAGS:TagOne,TagTwo,TagThree>>>`,

  // AD-11 Seam 4d: was asking Grok to state "typical EU/UK/Canada rates" --
  // no international rate series exists anywhere in this codebase's data
  // (unlike jumbo/arm, there's no real number to swap in), so this now asks
  // for directional/qualitative commentary only, with an explicit
  // instruction not to state specific foreign figures as if they were live
  // data -- consistent with the same grounding rule the other prompts
  // follow, rather than carrying the one exception forward.
  global: (ctx) => `Live FRED data as of today:
${ctx}

Put the US mortgage rate environment in global context:
1. Discuss directionally how the US 30Y rate compares to typical developed-market mortgage rates (e.g. EU, UK, Canada) — describe the relationship qualitatively (higher/lower, and why) without stating specific foreign rate figures, since only US data is provided here
2. How the 10Y Treasury yield (from the data above) connects to global bond market movements
3. What divergence between US Fed Funds and other central bank policies signals for US rates from today forward

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>`,
};

function sse(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const chipType: string = body.chipType ?? 'initial';
  const rateCtx: Record<string, unknown> = body.rateContext ?? {};

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'XAI_API_KEY not configured' }), { status: 503 });
  }

  // For rate-news chip: Tavily search first, then Grok synthesis
  let tavilyContext = '';
  if (chipType === 'rate-news') {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      try {
        const tr = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: 'mortgage rates news this week 2026 Fed inflation',
            search_depth: 'basic',
            max_results: 5,
          }),
        });
        if (tr.ok) {
          const td = await tr.json();
          tavilyContext = (td.results ?? []).slice(0, 5)
            .map((r: any) => `${r.title}: ${String(r.content ?? '').slice(0, 250)}`)
            .join('\n\n');
        }
      } catch { /* non-fatal */ }
    }
  }

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const ctxStr = JSON.stringify({
    'TODAY (analysis date)': today,
    'FRED data as of': rateCtx.lastUpdated ?? today,
    '30Y Fixed Rate': `${rateCtx.rate30y ?? 'N/A'}%`,
    '15Y Fixed Rate': `${rateCtx.rate15y ?? 'N/A'}%`,
    '10Y Treasury Yield': `${rateCtx.rate10y ?? 'N/A'}%`,
    'MBS Spread (30Y minus 10Y)': `${rateCtx.spread ?? 'N/A'} bps`,
    'Fed Funds Rate': `${rateCtx.fedFunds ?? 'N/A'}%`,
    'CPI YoY Inflation': `${rateCtx.cpi ?? 'N/A'}%`,
    '52-Week High (30Y)': `${rateCtx.week52High ?? 'N/A'}%`,
    '52-Week Low (30Y)': `${rateCtx.week52Low ?? 'N/A'}%`,
    'YTD Change (30Y)': `${rateCtx.ytdChange ?? 'N/A'}%`,
    // AD-11 Seam 4d: real OBMMI/segment data, always included (same pattern
    // as every other field here -- unconditional regardless of chipType) so
    // any chip's grounding context has real numbers to cite instead of
    // asking Grok to estimate them, as the jumbo/arm-vs-fixed prompts
    // previously did.
    'Jumbo 30Y Rate (OBMMI)':        `${rateCtx.jumboRate ?? 'N/A'}%`,
    'FHA 30Y Rate (OBMMI)':          `${rateCtx.fhaRate ?? 'N/A'}%`,
    'VA 30Y Rate (OBMMI)':           `${rateCtx.vaRate ?? 'N/A'}%`,
    'USDA 30Y Rate (OBMMI)':         `${rateCtx.usdaRate ?? 'N/A'}%`,
    '5/1 ARM Rate':                  `${rateCtx.arm5y1Rate ?? 'N/A'}%`,
    'Conventional Best-Tier Rate (740+ FICO, <=80% LTV, OBMMI)': `${rateCtx.conventionalBestTier ?? 'N/A'}%`,
    'Conventional Rate Range Across All Credit/LTV Tiers (OBMMI)': `${rateCtx.conventionalRangeLow ?? 'N/A'}% - ${rateCtx.conventionalRangeHigh ?? 'N/A'}%`,
    ...(tavilyContext ? { 'Live News Headlines': tavilyContext } : {}),
  }, null, 2);

  const promptFn = CHIP_PROMPTS[chipType] ?? CHIP_PROMPTS['initial'];
  const userPrompt = promptFn(ctxStr);

  let upstream: Response;
  try {
    upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'grok-4.3',
        messages: [
          { role: 'system', content: GROUNDING_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
        stream: true,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    return new Response(JSON.stringify({ error: 'Grok API error', detail: errText }), { status: 502 });
  }

  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.body!.getReader();
      let buffer = '';
      let fullText = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data: ')) continue;
            const payload = t.slice(6);
            if (payload === '[DONE]') {
              // Parse tags from full text
              const tagMatch = fullText.match(/<<<TAGS:([^>]+)>>>/);
              const tags = tagMatch ? tagMatch[1].split(',').map(s => s.trim()) : [];
              const cleanText = fullText.replace(/<<<TAGS:[^>]+>>>/, '').trim();
              ctrl.enqueue(sse({ done: true, text: cleanText, tags }));
              ctrl.close();
              return;
            }
            try {
              const chunk = JSON.parse(payload);
              const token: string = chunk.choices?.[0]?.delta?.content ?? '';
              if (token) {
                fullText += token;
                ctrl.enqueue(sse({ token }));
              }
            } catch { /* skip */ }
          }
        }
        // Stream ended without [DONE]
        const tagMatch = fullText.match(/<<<TAGS:([^>]+)>>>/);
        const tags = tagMatch ? tagMatch[1].split(',').map(s => s.trim()) : [];
        const cleanText = fullText.replace(/<<<TAGS:[^>]+>>>/, '').trim();
        ctrl.enqueue(sse({ done: true, text: cleanText, tags }));
        ctrl.close();
      } catch (err: any) {
        ctrl.enqueue(sse({ error: err.message ?? 'Stream error' }));
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
