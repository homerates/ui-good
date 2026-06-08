// lib/driftLogger.ts
// Fire-and-forget routing drift logger.
// Called from answers/route.ts when dispatch returns no_calc_match on a prompt
// that looks like it should have been caught by a calculator card.

import { getSupabase } from './supabaseServer';

export interface DriftSignals {
  has_price: boolean;
  has_down: boolean;
  has_mortgage_ctx: boolean;
  has_location: boolean;
  location?: string;
  price_value?: number;
}

function extractSignals(prompt: string): DriftSignals {
  // Price: "$850k", "850k", "$1.2m", "1.2m", "$750,000" — excludes salary context
  const priceMatch =
    prompt.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?\b/) ||
    prompt.match(/\b([\d,]+(?:\.\d+)?)\s*([kKmM])\b(?!\s*(?:income|salary|\/yr|a year|per year|annual))/i);

  let price_value: number | undefined;
  if (priceMatch) {
    const raw = parseFloat(priceMatch[1].replace(/,/g, ''));
    const mult = /[kK]/i.test(priceMatch[2] ?? '') ? 1_000
               : /[mM]/i.test(priceMatch[2] ?? '') ? 1_000_000
               : 1;
    const candidate = raw * mult;
    // Only home-price range counts
    if (candidate >= 50_000 && candidate <= 30_000_000) price_value = candidate;
  }

  const has_price = price_value !== undefined;
  const has_down = /\d+\s*%\s*down|\bdown\s*payment\b/i.test(prompt);
  const has_mortgage_ctx = /\b(?:home|house|property|loan|mortgage|buying|purchase|condo|townhouse|payment|piti)\b/i.test(prompt);

  const locationMatch = prompt.match(
    /\b(los angeles|san francisco|new york|nyc|seattle|miami|chicago|austin|dallas|denver|boston|phoenix|portland|san diego|orange county|brooklyn|manhattan)\b/i
  );

  return {
    has_price,
    has_down,
    has_mortgage_ctx,
    has_location: !!locationMatch,
    location: locationMatch?.[1],
    price_value,
  };
}

function suggestCard(prompt: string, signals: DriftSignals): string | undefined {
  if (!signals.has_price && !signals.has_mortgage_ctx) return undefined;
  const t = prompt.toLowerCase();
  const pv = signals.price_value ?? 0;

  if (/\bfha\b/.test(t)) return 'fha';
  if (/\bva\b/.test(t) && /loan|mortgage|veteran|military|service/.test(t)) return 'va';
  if (/dscr|investment property|cash.?flow|rental income/.test(t)) return 'dscr';
  if (/refi|refinanc/.test(t)) return 'refi';
  if (/afford|budget|how much can i|what can i/.test(t)) return 'affordability';
  if (/jumbo/.test(t)) return 'jumbo';

  if (pv > 1_500_000) return 'jumbo';
  if (pv > 900_000) return 'conventional_or_jumbo';
  if (signals.has_down || signals.has_mortgage_ctx) return 'conventional';
  return undefined;
}

function shouldLog(prompt: string, signals: DriftSignals): boolean {
  // Needs at minimum: price + (down payment OR mortgage context)
  if (!signals.has_price) return false;
  if (!signals.has_down && !signals.has_mortgage_ctx) return false;

  // Intentionally excluded — these route to Grok on purpose
  const t = prompt.toLowerCase();
  if (/^heloc\s+on\b/.test(t)) return false;
  if (/payoff.*(?:plan|trajectory|milestones)|wealth.?building|equity trajectory/.test(t)) return false;
  if (/homeowner analysis|complete.*analysis.*for/.test(t)) return false;
  if (/^about homerates/i.test(prompt)) return false;
  if (/equity options.*(?:heloc|cash.?out|sell)/.test(t)) return false;

  return true;
}

export async function logDrift(
  seedPrompt: string,
  landedOn: string = 'grok',
  options?: { userId?: string; source?: 'auto' | 'manual' }
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const signals = extractSignals(seedPrompt);
  if (!shouldLog(seedPrompt, signals)) return;

  const suggested_card = suggestCard(seedPrompt, signals);

  try {
    await sb.from('routing_drift_log').insert({
      seed_prompt:    seedPrompt,
      landed_on:      landedOn,
      suggested_card: suggested_card ?? null,
      signals,
      source:         options?.source ?? 'auto',
      user_id:        options?.userId ?? null,
      status:         'open',
    });
  } catch (err: any) {
    console.warn('[driftLogger] insert failed:', err?.message);
  }
}
