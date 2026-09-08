'use client';
// app/property-intelligence-search/PropertyIntelligenceSearchClient.tsx
//
// Human-facing entry page for the Property Intelligence capability -- the
// companion to the machine-facing MCP tool (app/api/mcp/property-intelligence).
// An AI platform (ChatGPT etc.) can send a consumer here to continue in the
// full HomeRates product; a human can also arrive directly.
//
// REUSE, NOT A NEW PIPELINE -- this page does not resolve addresses, scrape
// Redfin/Zillow, or call any lookup API itself. On submit it hands the raw
// text to the EXISTING, unmodified /chat `sq` auto-seed mechanism
// (app/chat/page.tsx's own useEffect: `?sq=<value>` with no `fromShare`
// param starts a fresh thread and auto-sends that value through send() --
// the same address/Redfin/Zillow-URL extraction and /api/property/lookup
// call every existing entry point, including ConsumerWelcomeCard, already
// uses). That mechanism is untouched by this file. No new property-
// resolution pipeline is created here.
//
// COST GUARDRAIL -- nothing on this page itself fetches, scrapes, or calls
// any paid/live API. `?q=` only prefills the text input (useState from a
// prop, per this repo's slider-card convention); the actual navigation (and
// therefore the actual lookup) only happens inside handleSubmit(), which
// only ever runs from a real user click/Enter-key -- never on mount, never
// from an effect watching `initialValue`.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { SHORT_DISCLOSURE } from '@/disclosures';

export default function PropertyIntelligenceSearchClient({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    // Reuses the exact existing /chat auto-seed mechanism (sq without
    // fromShare=1 -> fresh thread, auto-send) -- see file header.
    router.push(`/chat?new=1&sq=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="page-standalone pis-root">
      <div className="pis-card">
        <div className="pis-label">Property Intelligence Search</div>
        <h1 className="pis-title">Understand a home before making the decision.</h1>
        <p className="pis-sub">
          Enter an address or paste a Zillow or Redfin listing to see HomeRates property,
          financing, ownership-cost, market and decision intelligence.
        </p>

        <div className="pis-inputrow">
          <AddressAutocomplete
            className="pis-input"
            placeholder="Address, Zillow URL, or Redfin URL"
            value={value}
            onChange={setValue}
            onSelect={(val) => setValue(val)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          />
          <button type="button" className="pis-btn" onClick={handleSubmit}>
            Analyze Property
          </button>
        </div>

        <p className="pis-disclaimer">{SHORT_DISCLOSURE} Not every property will have complete intelligence available.</p>
      </div>

      <style>{`
        .pis-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          background: #0a0e16;
        }
        .pis-card {
          width: 100%;
          max-width: 640px;
          background: linear-gradient(135deg, rgba(0,232,122,0.06), rgba(61,139,255,0.04));
          border: 1px solid rgba(0,232,122,0.18);
          border-radius: 18px;
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .pis-label {
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: #00e87a;
        }
        .pis-title {
          font-size: clamp(1.4rem, 4vw, 1.9rem); font-weight: 800;
          color: #f0f4ff; letter-spacing: -0.03em; line-height: 1.25; margin: 0;
        }
        .pis-sub {
          font-size: 0.92rem; color: #8fa3b8; line-height: 1.6; margin: 0;
        }
        .pis-inputrow {
          display: flex; align-items: center; gap: 10px; margin-top: 6px;
          background: #0e1420; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px; padding: 12px 12px 12px 16px;
        }
        .pis-inputrow:focus-within {
          border-color: rgba(0,232,122,0.4);
          box-shadow: 0 0 0 3px rgba(0,232,122,0.07);
        }
        .pis-input {
          flex: 1; min-width: 0; background: none; border: none; outline: none;
          color: #f0f4ff; font-family: inherit; font-size: 0.95rem;
        }
        .pis-input::placeholder { color: rgba(255,255,255,0.25); }
        .pis-btn {
          flex-shrink: 0; background: #00e87a; border: none;
          border-radius: 8px; padding: 10px 18px; color: #000;
          font-size: 0.85rem; font-weight: 700; cursor: pointer;
          font-family: inherit; white-space: nowrap; transition: opacity 0.15s;
        }
        .pis-btn:hover { opacity: 0.85; }
        @media (max-width: 480px) {
          .pis-inputrow { flex-wrap: wrap; }
          .pis-btn { width: 100%; }
        }
        .pis-disclaimer {
          font-size: 0.68rem; color: rgba(255,255,255,0.3); line-height: 1.5; margin: 4px 0 0;
        }
      `}</style>
    </div>
  );
}
