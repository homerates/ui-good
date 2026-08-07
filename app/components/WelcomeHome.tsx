'use client';

// WelcomeHome — the returning-user "I just came back home" moment on /my-home.
//
// Four elements, all fed by /api/consumer-memory (consumer_activity + Claude
// synthesis, heuristic fallback — see lib/crm/consumer-memory.ts):
//   1. Hero last-action card — the thing the user was actually doing last,
//      reconstructed as a "start again with these numbers" deep link.
//   2. Quick-ask pill + example-prompt chips → /chat?sq= (existing auto-send).
//   3. Thumb index — horizontal strip of the user's properties (same data as
//      the My Properties rail; this is a second lens on it, not a replacement).
//   4. Suggested next steps — selectable cards (radio-style), personalized by
//      the same synthesis call that writes the welcome copy.
//
// Decision 10 note: everything here is the consumer's own data, rendered only
// to them. The parent gates on !borrowerId so the LO-view path never mounts it.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PropertyPhoto from '@/components/PropertyPhoto';
import { AIDisclosureTag } from './AIDisclosureTag';
import type { ConsumerActivityEvent, ConsumerLastAction, ConsumerNextStep } from '../../lib/crm/consumer-memory';

export interface WelcomeHomeProperty {
    id: string;
    property_address: string;
    is_primary: boolean;
}

interface WelcomeHomeProps {
    firstName?: string | null;
    summaryText: string;
    lastAction: ConsumerLastAction | null;
    nextSteps: ConsumerNextStep[];
    events?: ConsumerActivityEvent[];
    properties: WelcomeHomeProperty[];
    activePropertyId: string | null;
    photoCache: Record<string, string | null>;
    onSelectProperty: (id: string) => void;
}

/** Best-effort known price from recent activity, so the "what can I afford"
 *  chip doesn't ask a bare question when we already have real numbers on
 *  file — /chat?sq= starts a brand-new chat with no history, so grounding
 *  has to happen in the seed text itself for the deterministic affordability
 *  parser (extractPrice) to pick it up. */
function findKnownPrice(events: ConsumerActivityEvent[] | undefined): number | null {
    for (const e of events ?? []) {
        const f = Array.isArray(e.key_facts) ? e.key_facts[0] as Record<string, unknown> : null;
        if (!f) continue;
        if (e.event_type === 'affordability_run' && typeof f.purchase_price === 'number') return f.purchase_price;
        if (e.event_type === 'rate_engine_run' && typeof f.loan_amount === 'number') {
            const ltv = typeof f.ltv === 'number' && f.ltv > 0 && f.ltv <= 100 ? f.ltv : 80;
            return Math.round(f.loan_amount / (ltv / 100));
        }
    }
    return null;
}

const MAX_STRIP = 10;

function chatHref(seed: string): string {
    return `/chat?sq=${encodeURIComponent(seed)}&from=%2Fmy-home&fromLabel=My+Home`;
}

function timeGreeting(): string {
    const h = new Date().getHours();
    if (h < 5)  return 'Up late';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

const EVENT_ICON: Record<string, string> = {
    affordability_run: '📐',
    property_viewed:   '🏡',
    rate_engine_run:   '📉',
    ami_run:           '🎯',
    ami_result:        '🎯',
};

export default function WelcomeHome({
    firstName, summaryText, lastAction, nextSteps, events,
    properties, activePropertyId, photoCache, onSelectProperty,
}: WelcomeHomeProps) {
    const router = useRouter();
    const [ask, setAsk] = useState('');
    const [selectedStep, setSelectedStep] = useState<number | null>(null);

    const greeting = useMemo(timeGreeting, []);

    // Example prompts — every chip must route to a VERIFIED target. Traced
    // through send()'s intent checks + the answers route (2026-07-18):
    //  1. Memory recap → /api/answers general path (personalMemoryContext
    //     answers it). Deliberately worded WITHOUT the word "rates" — the
    //     phrase "against today's rates" tripped isMarketRatesIntent and
    //     redirected to /market-intelligence, killing the recap.
    //  2. Afford → the canonical dti-scenarios affordability card. A bare
    //     "how much can I afford" seed hits the generic income-bracket table
    //     (/chat?sq= starts a brand-new chat, no history to draw on) — same
    //     "no bare question" problem as the market-rates one above. When we
    //     already know a price from recent activity, ground the seed with it
    //     so the deterministic parser (extractPrice) uses it directly.
    //  3. Assistance → direct link to /ami-qualifier (the purpose-built
    //     DPA/AMI tool). As a chat seed this got hijacked by the
    //     affordability regex and fired a calc card with fabricated
    //     income/savings defaults. No prompt is better than a wrong target.
    // The grounded seed must still literally trip isAffordabilityQuestion()'s
    // trigger list (lib/calcDispatcher.ts) — a seed that only implies
    // affordability without the trigger phrase falls through to a plain
    // fixed-price payment card instead of the affordability-range analysis
    // this chip promises. Verified against the actual regex before shipping.
    const knownPrice = useMemo(() => findKnownPrice(events), [events]);
    const affordSeed = knownPrice
        ? `What can I afford? I've been evaluating homes around $${knownPrice.toLocaleString()} — what's my full affordable range at today's rates, and what would it take to go higher?`
        : 'How much house can I afford?';
    const chips: { label: string; href: string }[] = [
        { label: "What's changed since I was here?", href: chatHref("What's changed since I was last here? Recap my recent scenarios and what's different now.") },
        { label: 'What can I afford?', href: chatHref(affordSeed) },
        { label: 'Check assistance eligibility', href: '/ami-qualifier' },
    ];

    function submitAsk(e: React.FormEvent) {
        e.preventDefault();
        const q = ask.trim();
        if (!q) return;
        router.push(chatHref(q));
    }

    const strip = properties.slice(0, MAX_STRIP);
    const overflow = properties.length - strip.length;
    const heroIcon = lastAction ? (EVENT_ICON[lastAction.event_type] ?? '⚡') : '⚡';

    return (
        <section className="wh" aria-label="Welcome home">
            {/* ambient aurora */}
            <div className="wh-aura" aria-hidden="true" />

            {/* ── Greeting ── */}
            <div className="wh-greet wh-in" style={{ animationDelay: '0s' }}>
                <div className="wh-kicker">Welcome home</div>
                <h2 className="wh-hello">
                    {greeting}{firstName ? `, ${firstName}` : ''} <span className="wh-wave" aria-hidden="true">👋</span>
                </h2>
            </div>

            <div className="wh-top">
                {/* ── 1 · Hero: last action ── */}
                {lastAction && (
                    <div className="wh-hero wh-in" style={{ animationDelay: '.08s' }}>
                        <div className="wh-hero-kicker">
                            <span className="wh-hero-pulse" aria-hidden="true" />
                            Pick up where you left off
                        </div>
                        <div className="wh-hero-main">
                            <span className="wh-hero-icon" aria-hidden="true">{heroIcon}</span>
                            <div>
                                <div className="wh-hero-title">{lastAction.title}</div>
                                <div className="wh-hero-detail">{lastAction.detail}</div>
                            </div>
                        </div>
                        {summaryText && (
                            <>
                                <AIDisclosureTag variant="inline" style={{ marginBottom: 6 }} />
                                <p className="wh-hero-copy">{summaryText}</p>
                            </>
                        )}
                        <Link href={lastAction.href} className="wh-hero-cta">
                            {lastAction.ctaLabel} <span aria-hidden="true">→</span>
                        </Link>
                    </div>
                )}

                {/* ── 2 · Quick ask ── */}
                <div className="wh-ask wh-in" style={{ animationDelay: '.16s' }}>
                    <div className="wh-ask-label">Or just ask</div>
                    <form onSubmit={submitAsk} className="wh-ask-pill">
                        <span className="wh-ask-spark" aria-hidden="true">✦</span>
                        <input
                            className="wh-ask-input"
                            value={ask}
                            onChange={e => setAsk(e.target.value)}
                            placeholder="Anything about your next move…"
                            aria-label="Ask HomeRates anything"
                        />
                        <button type="submit" className="wh-ask-go" disabled={!ask.trim()} aria-label="Send">↑</button>
                    </form>
                    <div className="wh-chips">
                        {chips.map((c, i) => (
                            <Link key={i} href={c.href} className="wh-chip">{c.label}</Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── 3 · Thumb index ── */}
            {strip.length > 1 && (
                <div className="wh-strip-wrap wh-in" style={{ animationDelay: '.24s' }}>
                    <div className="wh-row-label">You&rsquo;ve been looking at</div>
                    <div className="wh-strip" role="list">
                        {strip.map(p => {
                            const short = p.property_address.split(',')[0];
                            const active = p.id === activePropertyId;
                            return (
                                <button
                                    key={p.id}
                                    role="listitem"
                                    className={`wh-thumb${active ? ' wh-thumb-active' : ''}`}
                                    onClick={() => !active && onSelectProperty(p.id)}
                                    title={p.property_address}
                                >
                                    <div className="wh-thumb-photo">
                                        {photoCache[p.property_address] ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={photoCache[p.property_address]!} alt="" />
                                        ) : (
                                            <PropertyPhoto address={p.property_address} width={300} height={168}
                                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                        <div className="wh-thumb-scrim" aria-hidden="true" />
                                        {p.is_primary && <span className="wh-thumb-tag">My Home</span>}
                                        {active && <span className="wh-thumb-tag wh-thumb-tag-live">Viewing</span>}
                                    </div>
                                    <div className="wh-thumb-addr">{short}</div>
                                </button>
                            );
                        })}
                        {overflow > 0 && (
                            <div className="wh-thumb wh-thumb-more" aria-hidden="true">
                                <span>+{overflow} more</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── 4 · Next steps ── */}
            {nextSteps.length > 0 && (
                <div className="wh-steps-wrap wh-in" style={{ animationDelay: '.32s' }}>
                    <div className="wh-row-label">Suggested next steps</div>
                    <div className="wh-steps" role="radiogroup" aria-label="Suggested next steps">
                        {nextSteps.map((s, i) => {
                            const sel = selectedStep === i;
                            return (
                                <button
                                    key={i}
                                    role="radio"
                                    aria-checked={sel}
                                    className={`wh-step${sel ? ' wh-step-sel' : ''}`}
                                    onClick={() => setSelectedStep(sel ? null : i)}
                                >
                                    <span className={`wh-radio${sel ? ' wh-radio-on' : ''}`} aria-hidden="true"><span /></span>
                                    <span className="wh-step-body">
                                        <span className="wh-step-label">{s.label}</span>
                                        {s.detail && <span className="wh-step-detail">{s.detail}</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="wh-steps-foot">
                        <button
                            className="wh-go"
                            disabled={selectedStep === null}
                            onClick={() => { if (selectedStep !== null) router.push(chatHref(nextSteps[selectedStep].seed)); }}
                        >
                            {selectedStep === null ? 'Pick one to continue' : "Let's go"} {selectedStep !== null && <span aria-hidden="true">→</span>}
                        </button>
                        <Link href="/profile" className="wh-privacy">Based on your recent activity · manage or clear it anytime</Link>
                    </div>
                </div>
            )}

            <style>{`
.wh{position:relative;margin-bottom:2.2rem;padding:24px 24px 20px;border-radius:18px;border:1px solid rgba(0,232,122,0.16);background:linear-gradient(160deg,rgba(10,18,32,0.92),rgba(6,12,24,0.96));overflow:hidden;isolation:isolate}
.wh-aura{position:absolute;top:-160px;left:-120px;width:520px;height:420px;background:radial-gradient(closest-side,rgba(0,232,122,0.14),transparent 70%);filter:blur(10px);pointer-events:none;z-index:-1;animation:whDrift 14s ease-in-out infinite alternate}
@keyframes whDrift{from{transform:translate(0,0) scale(1)}to{transform:translate(120px,40px) scale(1.15)}}
.wh-in{opacity:0;animation:whUp .55s cubic-bezier(.22,.8,.32,1) forwards}
@keyframes whUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

.wh-greet{margin-bottom:16px}
.wh-kicker{font-size:.62rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(0,232,122,0.75);margin-bottom:4px}
.wh-hello{font-size:1.45rem;font-weight:800;letter-spacing:-.02em;color:#f0f4ff;margin:0}
.wh-wave{display:inline-block;transform-origin:70% 70%;animation:whWave 1.6s .6s ease-in-out 1}
@keyframes whWave{0%,100%{transform:rotate(0)}20%{transform:rotate(16deg)}40%{transform:rotate(-8deg)}60%{transform:rotate(12deg)}80%{transform:rotate(-4deg)}}

.wh-top{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px;align-items:stretch}
@media(max-width:860px){.wh-top{grid-template-columns:1fr}}

.wh-hero{position:relative;padding:18px;border-radius:14px;border:1px solid rgba(0,232,122,0.22);background:linear-gradient(150deg,rgba(0,232,122,0.07),rgba(0,232,122,0.02) 55%,transparent);animation-name:whUp;box-shadow:0 0 0 0 rgba(0,232,122,0.0);transition:box-shadow .3s}
.wh-hero:hover{box-shadow:0 0 34px -6px rgba(0,232,122,0.18)}
.wh-hero-kicker{display:flex;align-items:center;gap:7px;font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,232,122,0.85);margin-bottom:12px}
.wh-hero-pulse{width:7px;height:7px;border-radius:50%;background:#00e87a;animation:whPulse 2.2s ease-in-out infinite}
@keyframes whPulse{0%,100%{box-shadow:0 0 0 0 rgba(0,232,122,0.5)}55%{box-shadow:0 0 0 7px rgba(0,232,122,0)}}
.wh-hero-main{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}
.wh-hero-icon{font-size:1.7rem;line-height:1;filter:drop-shadow(0 0 12px rgba(0,232,122,0.35))}
.wh-hero-title{font-size:1.22rem;font-weight:800;letter-spacing:-.015em;color:#f0f4ff;line-height:1.25}
.wh-hero-detail{font-size:.78rem;color:rgba(185,208,192,0.65);margin-top:3px;font-variant-numeric:tabular-nums}
.wh-hero-copy{font-size:.85rem;line-height:1.55;color:rgba(240,244,255,0.72);margin:0 0 14px;max-width:52ch}
.wh-hero-cta{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:#00e87a;color:#04120a;font-size:.85rem;font-weight:700;text-decoration:none;transition:transform .15s,box-shadow .15s}
.wh-hero-cta:hover{transform:translateY(-1px);box-shadow:0 6px 20px -6px rgba(0,232,122,0.55)}

.wh-ask{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:18px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)}
.wh-ask-label{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(185,208,192,0.55)}
.wh-ask-pill{display:flex;align-items:center;gap:9px;padding:4px 6px 4px 14px;border-radius:999px;border:1.5px solid rgba(0,232,122,0.3);background:rgba(4,10,20,0.7);transition:border-color .2s,box-shadow .2s}
.wh-ask-pill:focus-within{border-color:rgba(0,232,122,0.65);box-shadow:0 0 0 4px rgba(0,232,122,0.10)}
.wh-ask-spark{color:rgba(0,232,122,0.8);font-size:.8rem}
.wh-ask-input{flex:1;min-width:0;background:none;border:none;outline:none;color:#f0f4ff;font-size:.88rem;padding:9px 0}
.wh-ask-input::placeholder{color:rgba(185,208,192,0.42)}
.wh-ask-go{width:34px;height:34px;border-radius:50%;border:none;background:#00e87a;color:#04120a;font-size:1rem;font-weight:800;cursor:pointer;flex-shrink:0;transition:opacity .15s,transform .15s}
.wh-ask-go:disabled{opacity:.28;cursor:default}
.wh-ask-go:not(:disabled):hover{transform:translateY(-1px)}
.wh-chips{display:flex;flex-wrap:wrap;gap:7px}
.wh-chip{padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.03);color:rgba(240,244,255,0.72);font-size:.74rem;font-weight:600;text-decoration:none;transition:border-color .15s,color .15s,background .15s}
.wh-chip:hover{border-color:rgba(0,232,122,0.45);color:#00e87a;background:rgba(0,232,122,0.06)}

.wh-row-label{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(185,208,192,0.5);margin:0 0 9px}
.wh-strip-wrap{margin-top:18px}
.wh-strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x proximity;scrollbar-width:none}
.wh-strip::-webkit-scrollbar{display:none}
.wh-thumb{flex:0 0 150px;scroll-snap-align:start;background:none;border:none;padding:0;cursor:pointer;text-align:left;border-radius:11px}
.wh-thumb-photo{position:relative;width:150px;height:86px;border-radius:11px;overflow:hidden;border:1.5px solid rgba(255,255,255,0.1);transition:border-color .18s,transform .18s}
.wh-thumb-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.wh-thumb:hover .wh-thumb-photo{transform:translateY(-2px);border-color:rgba(0,232,122,0.4)}
.wh-thumb-active .wh-thumb-photo{border-color:#00e87a;box-shadow:0 0 16px -4px rgba(0,232,122,0.5)}
.wh-thumb-scrim{position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgba(3,8,16,0.72))}
.wh-thumb-tag{position:absolute;top:6px;left:6px;padding:2px 8px;border-radius:999px;background:rgba(4,10,20,0.8);border:1px solid rgba(0,232,122,0.4);color:#00e87a;font-size:.56rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.wh-thumb-tag-live{left:auto;right:6px;background:#00e87a;color:#04120a;border-color:#00e87a}
.wh-thumb-addr{margin-top:6px;font-size:.72rem;font-weight:600;color:rgba(240,244,255,0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
.wh-thumb-more{display:flex;align-items:center;justify-content:center;height:86px;border-radius:11px;border:1.5px dashed rgba(255,255,255,0.14);color:rgba(185,208,192,0.5);font-size:.74rem;font-weight:700;cursor:default}

.wh-steps-wrap{margin-top:18px}
.wh-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.wh-step{display:flex;align-items:flex-start;gap:11px;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.02);cursor:pointer;text-align:left;transition:border-color .18s,background .18s,transform .18s}
.wh-step:hover{border-color:rgba(0,232,122,0.35);transform:translateY(-1px)}
.wh-step-sel{border-color:#00e87a;background:rgba(0,232,122,0.07)}
.wh-radio{width:17px;height:17px;border-radius:50%;border:1.5px solid rgba(185,208,192,0.4);flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;transition:border-color .18s}
.wh-radio span{width:8px;height:8px;border-radius:50%;background:#00e87a;transform:scale(0);transition:transform .18s cubic-bezier(.34,1.56,.64,1)}
.wh-radio-on{border-color:#00e87a}
.wh-radio-on span{transform:scale(1)}
.wh-step-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.wh-step-label{font-size:.84rem;font-weight:700;color:#f0f4ff;line-height:1.3}
.wh-step-detail{font-size:.72rem;color:rgba(185,208,192,0.55);line-height:1.4}
.wh-steps-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap}
.wh-go{padding:9px 20px;border-radius:10px;border:none;background:#00e87a;color:#04120a;font-size:.83rem;font-weight:700;cursor:pointer;transition:opacity .2s,transform .15s}
.wh-go:disabled{opacity:.3;cursor:default;background:rgba(0,232,122,0.5)}
.wh-go:not(:disabled):hover{transform:translateY(-1px)}
.wh-privacy{font-size:.68rem;color:rgba(185,208,192,0.42);text-decoration:none}
.wh-privacy:hover{color:rgba(0,232,122,0.7);text-decoration:underline}

/* Link-color guards — defensive twin of the WelcomePro fix: global/page-level
   anchor rules (e.g. shell content links) can override plain .wh-* classes
   and render the green CTA's dark text as green-on-green. 0-2-1 specificity
   wins regardless of stylesheet order. */
.wh a.wh-hero-cta,.wh a.wh-hero-cta:visited,.wh a.wh-hero-cta:hover{color:#04120a;opacity:1}
.wh a.wh-chip,.wh a.wh-chip:visited{color:rgba(240,244,255,0.72);opacity:1}
.wh a.wh-chip:hover{color:#00e87a;opacity:1}
.wh a.wh-privacy,.wh a.wh-privacy:visited{color:rgba(185,208,192,0.42);opacity:1}
.wh a.wh-privacy:hover{color:rgba(0,232,122,0.7);opacity:1}

@media(prefers-reduced-motion:reduce){
  .wh-in{animation:none;opacity:1}
  .wh-aura,.wh-wave,.wh-hero-pulse{animation:none}
  .wh-hero-cta:hover,.wh-thumb:hover .wh-thumb-photo,.wh-step:hover,.wh-go:not(:disabled):hover,.wh-ask-go:not(:disabled):hover{transform:none}
}
            `}</style>
        </section>
    );
}
