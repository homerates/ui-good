'use client';

// WelcomePro — the returning-professional "Welcome Home" moment on /pro/clients.
// One component for BOTH roles (LO + RE agent): the underlying data model is
// symmetric (borrowers keyed by loan_officer_id XOR agent_id; person_activity
// keyed by the professional's own Clerk id), so only labels differ.
//
// ── SOURCE RULE (mirrors lib/crm/pro-memory.ts) ───────────────────────────
// Everything rendered here derives from: the professional's OWN logged
// conversations, their OWN pipeline records, or public market data. Nothing
// here may state or imply observation of a client's independent platform
// behavior — the hero says "you two last talked", never "they've been busy".
//
// Visual sibling of WelcomeHome.tsx (same dark/green language, aurora,
// staggered entrance, reduced-motion support) with relationship avatars in
// place of property photos.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProRelationship } from '../../lib/crm/pro-memory';
import type { ConsumerNextStep } from '../../lib/crm/consumer-memory';

interface WelcomeProProps {
    firstName?: string | null;
    roleLabel: 'borrower' | 'client';   // lo → borrower, agent → client
    summaryText: string;
    lastTouch: ProRelationship | null;
    relationships: ProRelationship[];
    nextSteps: ConsumerNextStep[];
    marketRate: number | null;
}

const MAX_STRIP = 10;
const STALE_DAYS = 14;

function chatHref(seed: string): string {
    return `/chat?sq=${encodeURIComponent(seed)}&from=%2Fpro%2Fclients&fromLabel=Clients`;
}

function briefHref(borrowerId: string): string {
    return `/pro/clients/${borrowerId}/brief`;
}

function timeGreeting(): string {
    const h = new Date().getHours();
    if (h < 5)  return 'Up late';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function initials(name: string): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function whenLabel(days: number | null): string {
    if (days === null) return 'not yet';
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return `${Math.floor(days / 7)}w ago`;
}

export default function WelcomePro({
    firstName, roleLabel, summaryText, lastTouch, relationships, nextSteps, marketRate,
}: WelcomeProProps) {
    const router = useRouter();
    const [ask, setAsk] = useState('');
    const [selectedStep, setSelectedStep] = useState<number | null>(null);
    const greeting = useMemo(timeGreeting, []);

    // Example prompts — public market data + generic craft help only. None
    // may resolve to "what has {client} been doing on the platform".
    const chips = useMemo(() => ([
        { label: "Today's rate talking points", seed: 'What should I tell my clients about the current mortgage rate environment? Give me 3 client-ready talking points.' },
        { label: 'Draft a warm follow-up', seed: `Draft a short, warm follow-up message I can send a ${roleLabel} I haven't spoken with in a couple of weeks. Low-pressure, genuinely useful.` },
        { label: 'Prep my next call', seed: `Help me prepare for my next ${roleLabel} call — give me a quick checklist of what to cover in today's market.` },
    ]), [roleLabel]);

    function submitAsk(e: React.FormEvent) {
        e.preventDefault();
        const q = ask.trim();
        if (!q) return;
        router.push(chatHref(q));
    }

    const strip = relationships.slice(0, MAX_STRIP);
    const overflow = relationships.length - strip.length;

    return (
        <section className="wp" aria-label="Welcome back">
            <div className="wp-aura" aria-hidden="true" />

            {/* ── Greeting ── */}
            <div className="wp-greet wp-in" style={{ animationDelay: '0s' }}>
                <div className="wp-kicker">Your relationships</div>
                <h2 className="wp-hello">
                    {greeting}{firstName ? `, ${firstName}` : ''} <span className="wp-wave" aria-hidden="true">👋</span>
                </h2>
            </div>

            <div className="wp-top">
                {/* ── 1 · Hero: most recent OWN conversation ── */}
                {lastTouch && (
                    <div className="wp-hero wp-in" style={{ animationDelay: '.08s' }}>
                        <div className="wp-hero-kicker">
                            <span className="wp-hero-pulse" aria-hidden="true" />
                            Pick up the conversation
                        </div>
                        <div className="wp-hero-main">
                            <span className="wp-avatar wp-avatar-lg" aria-hidden="true">{initials(lastTouch.name)}</span>
                            <div>
                                <div className="wp-hero-title">{lastTouch.name}</div>
                                <div className="wp-hero-detail">
                                    You two last talked {whenLabel(lastTouch.days_since_touch)}
                                    {lastTouch.last_subject ? ` · “${lastTouch.last_subject.slice(0, 60)}”` : ''}
                                </div>
                            </div>
                        </div>
                        {summaryText && <p className="wp-hero-copy">{summaryText}</p>}
                        <Link href={briefHref(lastTouch.borrower_id)} className="wp-hero-cta">
                            Continue the conversation <span aria-hidden="true">→</span>
                        </Link>
                    </div>
                )}

                {/* ── 2 · Quick ask ── */}
                <div className="wp-ask wp-in" style={{ animationDelay: '.16s' }}>
                    <div className="wp-ask-label">Or just ask</div>
                    <form onSubmit={submitAsk} className="wp-ask-pill">
                        <span className="wp-ask-spark" aria-hidden="true">✦</span>
                        <input
                            className="wp-ask-input"
                            value={ask}
                            onChange={e => setAsk(e.target.value)}
                            placeholder="Anything about your book or the market…"
                            aria-label="Ask HomeRates anything"
                        />
                        <button type="submit" className="wp-ask-go" disabled={!ask.trim()} aria-label="Send">↑</button>
                    </form>
                    <div className="wp-chips">
                        {chips.map((c, i) => (
                            <Link key={i} href={chatHref(c.seed)} className="wp-chip">{c.label}</Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── 3 · Thumb index: relationships by OWN interaction recency ── */}
            {strip.length > 1 && (
                <div className="wp-strip-wrap wp-in" style={{ animationDelay: '.24s' }}>
                    <div className="wp-row-label">Your recent conversations</div>
                    <div className="wp-strip" role="list">
                        {strip.map(r => {
                            const stale = r.days_since_touch !== null && r.days_since_touch >= STALE_DAYS;
                            const never = r.days_since_touch === null;
                            return (
                                <Link key={r.borrower_id} role="listitem" href={briefHref(r.borrower_id)} className="wp-card" title={r.name}>
                                    <span className="wp-avatar" aria-hidden="true">{initials(r.name)}</span>
                                    <span className="wp-card-name">{r.name.split(/\s+/)[0]}</span>
                                    <span className={`wp-card-when${stale ? ' wp-card-when-stale' : ''}${never ? ' wp-card-when-new' : ''}`}>
                                        {never ? 'new' : whenLabel(r.days_since_touch)}
                                    </span>
                                </Link>
                            );
                        })}
                        {overflow > 0 && (
                            <div className="wp-card wp-card-more" aria-hidden="true"><span>+{overflow} more</span></div>
                        )}
                    </div>
                </div>
            )}

            {/* ── 4 · Next steps ── */}
            {nextSteps.length > 0 && (
                <div className="wp-steps-wrap wp-in" style={{ animationDelay: '.32s' }}>
                    <div className="wp-row-label">Suggested next steps</div>
                    <div className="wp-steps" role="radiogroup" aria-label="Suggested next steps">
                        {nextSteps.map((s, i) => {
                            const sel = selectedStep === i;
                            return (
                                <button
                                    key={i}
                                    role="radio"
                                    aria-checked={sel}
                                    className={`wp-step${sel ? ' wp-step-sel' : ''}`}
                                    onClick={() => setSelectedStep(sel ? null : i)}
                                >
                                    <span className={`wp-radio${sel ? ' wp-radio-on' : ''}`} aria-hidden="true"><span /></span>
                                    <span className="wp-step-body">
                                        <span className="wp-step-label">{s.label}</span>
                                        {s.detail && <span className="wp-step-detail">{s.detail}</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="wp-steps-foot">
                        <button
                            className="wp-go"
                            disabled={selectedStep === null}
                            onClick={() => { if (selectedStep !== null) router.push(chatHref(nextSteps[selectedStep].seed)); }}
                        >
                            {selectedStep === null ? 'Pick one to continue' : "Let's go"} {selectedStep !== null && <span aria-hidden="true">→</span>}
                        </button>
                        <span className="wp-privacy">
                            Built from your own logged conversations, your pipeline, and market data — never from {roleLabel} browsing activity.
                        </span>
                    </div>
                </div>
            )}

            <style>{`
.wp{position:relative;margin-bottom:2rem;padding:24px 24px 20px;border-radius:18px;border:1px solid rgba(0,232,122,0.16);background:linear-gradient(160deg,rgba(10,18,32,0.92),rgba(6,12,24,0.96));overflow:hidden;isolation:isolate}
.wp-aura{position:absolute;top:-160px;right:-120px;width:520px;height:420px;background:radial-gradient(closest-side,rgba(0,232,122,0.13),transparent 70%);filter:blur(10px);pointer-events:none;z-index:-1;animation:wpDrift 14s ease-in-out infinite alternate}
@keyframes wpDrift{from{transform:translate(0,0) scale(1)}to{transform:translate(-110px,40px) scale(1.15)}}
.wp-in{opacity:0;animation:wpUp .55s cubic-bezier(.22,.8,.32,1) forwards}
@keyframes wpUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

.wp-greet{margin-bottom:16px}
.wp-kicker{font-size:.62rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(0,232,122,0.75);margin-bottom:4px}
.wp-hello{font-size:1.4rem;font-weight:800;letter-spacing:-.02em;color:#f0f4ff;margin:0}
.wp-wave{display:inline-block;transform-origin:70% 70%;animation:wpWave 1.6s .6s ease-in-out 1}
@keyframes wpWave{0%,100%{transform:rotate(0)}20%{transform:rotate(16deg)}40%{transform:rotate(-8deg)}60%{transform:rotate(12deg)}80%{transform:rotate(-4deg)}}

.wp-top{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px;align-items:stretch}
@media(max-width:860px){.wp-top{grid-template-columns:1fr}}

.wp-hero{position:relative;padding:18px;border-radius:14px;border:1px solid rgba(0,232,122,0.22);background:linear-gradient(150deg,rgba(0,232,122,0.07),rgba(0,232,122,0.02) 55%,transparent);transition:box-shadow .3s}
.wp-hero:hover{box-shadow:0 0 34px -6px rgba(0,232,122,0.18)}
.wp-hero-kicker{display:flex;align-items:center;gap:7px;font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,232,122,0.85);margin-bottom:12px}
.wp-hero-pulse{width:7px;height:7px;border-radius:50%;background:#00e87a;animation:wpPulse 2.2s ease-in-out infinite}
@keyframes wpPulse{0%,100%{box-shadow:0 0 0 0 rgba(0,232,122,0.5)}55%{box-shadow:0 0 0 7px rgba(0,232,122,0)}}
.wp-hero-main{display:flex;align-items:center;gap:13px;margin-bottom:10px}
.wp-hero-title{font-size:1.22rem;font-weight:800;letter-spacing:-.015em;color:#f0f4ff;line-height:1.25}
.wp-hero-detail{font-size:.78rem;color:rgba(185,208,192,0.65);margin-top:3px}
.wp-hero-copy{font-size:.85rem;line-height:1.55;color:rgba(240,244,255,0.72);margin:0 0 14px;max-width:52ch}
.wp-hero-cta{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:#00e87a;color:#04120a;font-size:.85rem;font-weight:700;text-decoration:none;transition:transform .15s,box-shadow .15s}
.wp-hero-cta:hover{transform:translateY(-1px);box-shadow:0 6px 20px -6px rgba(0,232,122,0.55)}

.wp-avatar{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;flex-shrink:0;background:rgba(0,232,122,0.12);border:1.5px solid rgba(0,232,122,0.35);color:#00e87a;font-size:.82rem;font-weight:800;letter-spacing:.02em}
.wp-avatar-lg{width:48px;height:48px;font-size:1rem}

.wp-ask{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:18px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)}
.wp-ask-label{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(185,208,192,0.55)}
.wp-ask-pill{display:flex;align-items:center;gap:9px;padding:4px 6px 4px 14px;border-radius:999px;border:1.5px solid rgba(0,232,122,0.3);background:rgba(4,10,20,0.7);transition:border-color .2s,box-shadow .2s}
.wp-ask-pill:focus-within{border-color:rgba(0,232,122,0.65);box-shadow:0 0 0 4px rgba(0,232,122,0.10)}
.wp-ask-spark{color:rgba(0,232,122,0.8);font-size:.8rem}
.wp-ask-input{flex:1;min-width:0;background:none;border:none;outline:none;color:#f0f4ff;font-size:.88rem;padding:9px 0}
.wp-ask-input::placeholder{color:rgba(185,208,192,0.42)}
.wp-ask-go{width:34px;height:34px;border-radius:50%;border:none;background:#00e87a;color:#04120a;font-size:1rem;font-weight:800;cursor:pointer;flex-shrink:0;transition:opacity .15s,transform .15s}
.wp-ask-go:disabled{opacity:.28;cursor:default}
.wp-ask-go:not(:disabled):hover{transform:translateY(-1px)}
.wp-chips{display:flex;flex-wrap:wrap;gap:7px}
.wp-chip{padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.03);color:rgba(240,244,255,0.72);font-size:.74rem;font-weight:600;text-decoration:none;transition:border-color .15s,color .15s,background .15s}
.wp-chip:hover{border-color:rgba(0,232,122,0.45);color:#00e87a;background:rgba(0,232,122,0.06)}

.wp-row-label{font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(185,208,192,0.5);margin:0 0 9px}
.wp-strip-wrap{margin-top:18px}
.wp-strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x proximity;scrollbar-width:none}
.wp-strip::-webkit-scrollbar{display:none}
.wp-card{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 14px 10px;min-width:104px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.02);text-decoration:none;scroll-snap-align:start;transition:border-color .18s,transform .18s}
.wp-card:hover{transform:translateY(-2px);border-color:rgba(0,232,122,0.4)}
.wp-card-name{font-size:.76rem;font-weight:700;color:rgba(240,244,255,0.85);max-width:96px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wp-card-when{font-size:.62rem;font-weight:700;padding:2px 9px;border-radius:999px;background:rgba(0,232,122,0.1);border:1px solid rgba(0,232,122,0.25);color:rgba(0,232,122,0.85)}
.wp-card-when-stale{background:rgba(245,158,11,0.1);border-color:rgba(245,158,11,0.35);color:#f5b04b}
.wp-card-when-new{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.14);color:rgba(185,208,192,0.6)}
.wp-card-more{justify-content:center;color:rgba(185,208,192,0.5);font-size:.74rem;font-weight:700;border-style:dashed;cursor:default}

.wp-steps-wrap{margin-top:18px}
.wp-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.wp-step{display:flex;align-items:flex-start;gap:11px;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.02);cursor:pointer;text-align:left;transition:border-color .18s,background .18s,transform .18s}
.wp-step:hover{border-color:rgba(0,232,122,0.35);transform:translateY(-1px)}
.wp-step-sel{border-color:#00e87a;background:rgba(0,232,122,0.07)}
.wp-radio{width:17px;height:17px;border-radius:50%;border:1.5px solid rgba(185,208,192,0.4);flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;transition:border-color .18s}
.wp-radio span{width:8px;height:8px;border-radius:50%;background:#00e87a;transform:scale(0);transition:transform .18s cubic-bezier(.34,1.56,.64,1)}
.wp-radio-on{border-color:#00e87a}
.wp-radio-on span{transform:scale(1)}
.wp-step-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.wp-step-label{font-size:.84rem;font-weight:700;color:#f0f4ff;line-height:1.3}
.wp-step-detail{font-size:.72rem;color:rgba(185,208,192,0.55);line-height:1.4}
.wp-steps-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap}
.wp-go{padding:9px 20px;border-radius:10px;border:none;background:#00e87a;color:#04120a;font-size:.83rem;font-weight:700;cursor:pointer;transition:opacity .2s,transform .15s}
.wp-go:disabled{opacity:.3;cursor:default;background:rgba(0,232,122,0.5)}
.wp-go:not(:disabled):hover{transform:translateY(-1px)}
.wp-privacy{font-size:.68rem;color:rgba(185,208,192,0.42)}

@media(prefers-reduced-motion:reduce){
  .wp-in{animation:none;opacity:1}
  .wp-aura,.wp-wave,.wp-hero-pulse{animation:none}
  .wp-hero-cta:hover,.wp-card:hover,.wp-step:hover,.wp-go:not(:disabled):hover,.wp-ask-go:not(:disabled):hover{transform:none}
}
            `}</style>
        </section>
    );
}
