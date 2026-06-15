// app/api/rate-intelligence/route.ts
// GET  — aggregates FRED series + computes meta stats
// POST — Grok Oracle streaming for chip interactions

import { NextRequest } from 'next/server';

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
}

// ── FRED helpers ──────────────────────────────────────────────────────────────

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations?file_type=json';
const FALLBACKS = { rate30y: 6.82, rate15y: 6.21, rate10y: 4.26, fedFunds: 4.50, cpi: 3.1 };

function fredUrl(seriesId: string, key: string, params: Record<string, string> = {}): string {
  const p = new URLSearchParams({ series_id: seriesId, api_key: key, ...params });
  return `${FRED_BASE}&${p.toString()}`;
}

function parseObs(obs: any[]): RatePoint[] {
  return (obs ?? [])
    .filter((o: any) => o.value && o.value !== '.' && !isNaN(parseFloat(o.value)))
    .map((o: any) => ({ date: o.date as string, value: parseFloat(o.value) }));
}

async function fetchSeries(url: string): Promise<RatePoint[]> {
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = await r.json();
    return parseObs(j.observations ?? []);
  } catch { return []; }
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const key = process.env.FRED_API_KEY ?? '';

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
    ytd30y,
  ] = await Promise.all([
    fetchSeries(fredUrl('MORTGAGE30US', key, { observation_start: oneYearAgo, sort_order: 'asc' })),
    fetchSeries(fredUrl('MORTGAGE30US', key, { observation_start: fiveYearsAgo, sort_order: 'asc' })),
    fetchSeries(fredUrl('MORTGAGE15US', key, { observation_start: oneYearAgo, sort_order: 'asc' })),
    fetchSeries(fredUrl('DGS10', key, { observation_start: oneYearAgo, sort_order: 'asc' })),
    fetchSeries(fredUrl('FEDFUNDS', key, { observation_start: oneYearAgo, sort_order: 'asc' })),
    fetchSeries(fredUrl('CPIAUCSL', key, { observation_start: oneYearAgo, sort_order: 'asc' })),
    fetchSeries(fredUrl('MORTGAGE30US', key, { observation_start: ytdStart, sort_order: 'asc', limit: '2' })),
  ]);

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

  const data: RateIntelData = {
    current: { rate30y: cur30y, rate15y: cur15y, rate10y: cur10y, fedFunds: curFed, cpi: curCpi, lastUpdated: lastDate },
    series: {
      weekly30y:    series30y,
      historical30y: hist30y,
      weekly15y:    series15y,
      weekly10y:    series10y,
      monthlyFed:   seriesFed,
      monthlyCpi:   seriesCpi,
    },
    meta: { week52High, week52Low, ytdStart: ytdStart30y, ytdChange, fromPeak, allTimePeak, spread },
  };

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
    },
  });
}

// ── POST — Grok Oracle streaming ──────────────────────────────────────────────

const CHIP_PROMPTS: Record<string, (ctx: string) => string> = {
  initial: (ctx) => `You are the HomeRates.AI Rate Oracle — a sharp, data-driven mortgage market analyst. Today's data: ${ctx}

Write a concise, high-quality market intelligence brief in 2-3 short paragraphs. Cover:
1. Current rate environment and what's driving it (MBS spread, treasury correlation, inflation)
2. What buyers and homeowners should know right now
3. Strategic signal — bullish, bearish, or neutral?

End your response with exactly this line:
<<<TAGS:TagOne,TagTwo,TagThree,TagFour,TagFive>>>

Tags should be 2-3 word market signals. Be authoritative, specific, not generic.`,

  'fed-impact': (ctx) => `You are the HomeRates.AI Rate Oracle. Data: ${ctx}

Explain how Federal Reserve policy is flowing through to mortgage rates right now. Cover:
1. The Fed Funds → 10Y Treasury → Mortgage Rate transmission mechanism
2. Current spread dynamics and what they signal
3. What upcoming FOMC decisions mean for borrowers

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>
Be specific and analytical.`,

  'lock-window': (ctx) => `You are the HomeRates.AI Rate Oracle. Data: ${ctx}

Provide a strategic rate lock recommendation. Cover:
1. Is this a good time to lock based on rate position in the 52-week range?
2. Float vs lock risk/reward given current spread and trend
3. Float-down option strategy for buyers under contract
4. Specific recommendation with rationale

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>`,

  'rate-drop': (ctx) => `You are the HomeRates.AI Rate Oracle. Data: ${ctx}

Analyze when and how much rates could fall. Cover:
1. What conditions would need to be true for rates to reach 6.5%, 6%, 5.5%
2. Fed cut timeline and magnitude needed
3. Inflation trajectory required
4. Realistic probability assessment and timeframe

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>`,

  'arm-vs-fixed': (ctx) => `You are the HomeRates.AI Rate Oracle. Data: ${ctx}

Compare ARM vs 30Y Fixed in today's environment. Cover:
1. Current spread between 30Y Fixed and 5/1 ARM
2. Break-even analysis: how long before fixed wins?
3. Who should consider an ARM right now?
4. Rate cap risk if held past 5 years

End with: <<<TAGS:TagOne,TagTwo,TagThree,TagFour>>>`,

  jumbo: (ctx) => `You are the HomeRates.AI Rate Oracle. Data: ${ctx}

Analyze the Jumbo mortgage rate premium. Cover:
1. Current Jumbo vs conforming spread and why it's at this level
2. How Jumbo is affected differently by Fed policy vs MBS market
3. Which loan sizes benefit most from Jumbo today?
4. Bank portfolio lending dynamics

End with: <<<TAGS:TagOne,TagTwo,TagThree>>>`,

  global: (ctx) => `You are the HomeRates.AI Rate Oracle. Data: ${ctx}

Put US mortgage rates in global context. Cover:
1. US 30Y rates vs typical EU/UK/Canada rates and why the US is uniquely high
2. How global bond market movements affect US mortgage rates
3. What foreign central bank policies (ECB, Bank of England) signal for US rates

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

  const ctxStr = JSON.stringify({
    '30Y Fixed': `${rateCtx.rate30y ?? 'N/A'}%`,
    '15Y Fixed': `${rateCtx.rate15y ?? 'N/A'}%`,
    '10Y Treasury': `${rateCtx.rate10y ?? 'N/A'}%`,
    'Fed Funds': `${rateCtx.fedFunds ?? 'N/A'}%`,
    'CPI': `${rateCtx.cpi ?? 'N/A'}%`,
    '52-week High': `${rateCtx.week52High ?? 'N/A'}%`,
    '52-week Low': `${rateCtx.week52Low ?? 'N/A'}%`,
    'MBS Spread (bps)': rateCtx.spread ?? 'N/A',
    'YTD Change': `${rateCtx.ytdChange ?? 'N/A'}%`,
    ...(tavilyContext ? { 'Live News': tavilyContext } : {}),
  }, null, 2);

  const promptFn = CHIP_PROMPTS[chipType] ?? CHIP_PROMPTS['initial'];
  const systemPrompt = promptFn(ctxStr);

  if (chipType === 'rate-news' && !tavilyContext) {
    // Fallback to web-search Grok
  }

  let upstream: Response;
  try {
    upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'grok-4.3',
        messages: [{ role: 'user', content: systemPrompt }],
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
