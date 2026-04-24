'use client';

// app/components/MarketIntelCard.tsx
// Renders the structured 3-engine Market Intelligence report in a rich card UI.

interface PricePosition {
  list_price?: number | null;
  avm?: number | null;
  gap_amount?: number | null;
  gap_percent?: number | null;
  interpretation: string;
  gap_analysis: string;
}

interface MarketIntelReport {
  headline: string;
  confidence_score: 'Low' | 'Medium' | 'High';
  price_position: PricePosition;
  buyer_takeaway: string;
  possible_explanations: string[];
  negotiation_signals: string[];
  red_flags: string[];
  questions_to_ask: string[];
  comp_strategy: string[];
  mortgage_angle: string[];
  offer_signal: 'Cautious' | 'Needs Comp Review' | 'Potential Leverage' | 'Strongly Supported';
  source_notes: string[];
  disclaimer: string;
}

interface Props {
  report: MarketIntelReport;
  address: string;
  onClose: () => void;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`;
  return `$${n.toLocaleString()}`;
}

const OFFER_SIGNAL_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  'Cautious':          { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', border: 'rgba(239,68,68,0.35)'   },
  'Needs Comp Review': { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', border: 'rgba(234,179,8,0.35)'   },
  'Potential Leverage':{ bg: 'rgba(99,179,237,0.15)',  color: '#93c5fd', border: 'rgba(99,179,237,0.35)'  },
  'Strongly Supported':{ bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', border: 'rgba(34,197,94,0.35)'   },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  'Low': '#f87171', 'Medium': '#facc15', 'High': '#4ade80',
};

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 22 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
        {title}
      </div>
    </div>
  );
}

function BulletList({ items, color = 'rgba(224,240,232,0.8)' }: { items: string[]; color?: string }) {
  if (!items?.length) return null;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.82rem', color, lineHeight: 1.5 }}>
          <span style={{ color: '#a78bfa', flexShrink: 0, marginTop: 2 }}>▸</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function MarketIntelCard({ report, address, onClose }: Props) {
  const sig = report.offer_signal ?? 'Needs Comp Review';
  const sigStyle = OFFER_SIGNAL_STYLES[sig] ?? OFFER_SIGNAL_STYLES['Needs Comp Review'];
  const confColor = CONFIDENCE_COLORS[report.confidence_score] ?? '#facc15';

  const gapPct = report.price_position?.gap_percent;
  const gapAmt = report.price_position?.gap_amount;
  const listPrice = report.price_position?.list_price;
  const avm = report.price_position?.avm;

  return (
    // Backdrop
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '20px 12px 40px',
        overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 620,
        background: 'linear-gradient(160deg, #0c1320 0%, #111827 100%)',
        border: '1px solid rgba(139,92,246,0.30)',
        borderRadius: 20,
        boxShadow: '0 8px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.10)',
        overflow: 'hidden',
        fontFamily: 'var(--font-dm-sans, system-ui, sans-serif)',
        position: 'relative',
      }}>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 16,
            background: 'rgba(255,255,255,0.07)', border: 'none',
            borderRadius: 99, width: 28, height: 28,
            cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
        >×</button>

        {/* Header bar */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.20) 0%, rgba(59,130,246,0.12) 100%)',
          borderBottom: '1px solid rgba(139,92,246,0.20)',
          padding: '18px 20px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 20, filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.7))' }}>🔮</span>
            <span style={{
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: 999,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(59,130,246,0.25))',
              border: '1px solid rgba(139,92,246,0.40)',
              color: 'rgba(167,139,250,0.95)',
            }}>
              AI Market Analysis
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: confColor, fontWeight: 700 }}>
              {report.confidence_score} Confidence
            </span>
          </div>

          {/* Headline */}
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.4, marginBottom: 8 }}>
            {report.headline}
          </div>

          {/* Address */}
          <div style={{ fontSize: '0.72rem', color: 'rgba(148,163,184,0.7)' }}>
            {address}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 24px' }}>

          {/* Price Gap Alert
               gapPct = (list - avm) / avm * 100
               positive → listed ABOVE AVM (overpriced, red for buyer)
               negative → listed BELOW AVM (potential value, green for buyer) */}
          {gapPct != null && (
            <div style={{
              marginTop: 18,
              padding: '12px 16px',
              borderRadius: 10,
              background: gapPct > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
              border: `1px solid ${gapPct > 0 ? 'rgba(239,68,68,0.20)' : 'rgba(34,197,94,0.20)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
                    Price Gap Alert
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {listPrice && <div><div style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>List Price</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#93c5fd' }}>{fmt(listPrice)}</div></div>}
                    {avm && <div><div style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Redfin AVM</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: gapPct > 0 ? '#f87171' : '#4ade80' }}>{fmt(avm)}</div></div>}
                  </div>
                </div>
                <div style={{
                  padding: '8px 12px', borderRadius: 8, textAlign: 'center', flexShrink: 0,
                  background: gapPct > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: gapPct > 0 ? '#f87171' : '#4ade80', lineHeight: 1 }}>
                    {gapPct > 0 ? '+' : ''}{gapPct}%
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {gapPct > 0 ? 'listed above AVM' : 'listed below AVM'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Offer Signal badge */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              padding: '8px 16px', borderRadius: 8,
              background: sigStyle.bg, border: `1px solid ${sigStyle.border}`,
              fontSize: '0.75rem', fontWeight: 700, color: sigStyle.color,
              letterSpacing: '0.04em',
            }}>
              {sig}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(148,163,184,0.6)' }}>Offer Signal</div>
          </div>

          {/* Price Position Interpretation */}
          {report.price_position?.interpretation && (
            <>
              <SectionHeader icon="📊" title="Price Position" />
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(203,213,225,0.9)', lineHeight: 1.65 }}>
                {report.price_position.interpretation}
              </p>
              {report.price_position.gap_analysis && (
                <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'rgba(148,163,184,0.75)', lineHeight: 1.6, fontStyle: 'italic' }}>
                  {report.price_position.gap_analysis}
                </p>
              )}
            </>
          )}

          {/* Buyer Takeaway */}
          {report.buyer_takeaway && (
            <>
              <SectionHeader icon="💡" title="Buyer Takeaway" />
              <p style={{
                margin: 0, fontSize: '0.85rem', lineHeight: 1.65,
                color: 'rgba(167,243,208,0.9)',
                padding: '12px 14px', borderRadius: 8,
                background: 'rgba(34,197,94,0.06)',
                border: '1px solid rgba(34,197,94,0.15)',
              }}>
                {report.buyer_takeaway}
              </p>
            </>
          )}

          {/* Negotiation Signals */}
          {report.negotiation_signals?.length > 0 && (
            <>
              <SectionHeader icon="🤝" title="Negotiation Signals" />
              <BulletList items={report.negotiation_signals} color="rgba(147,197,253,0.85)" />
            </>
          )}

          {/* Red Flags */}
          {report.red_flags?.length > 0 && (
            <>
              <SectionHeader icon="🚩" title="Red Flags — Verify Before Offering" />
              <BulletList items={report.red_flags} color="rgba(252,165,165,0.85)" />
            </>
          )}

          {/* Questions to Ask */}
          {report.questions_to_ask?.length > 0 && (
            <>
              <SectionHeader icon="❓" title="Questions to Ask" />
              <BulletList items={report.questions_to_ask} color="rgba(253,230,138,0.85)" />
            </>
          )}

          {/* Possible Explanations */}
          {report.possible_explanations?.length > 0 && (
            <>
              <SectionHeader icon="🔍" title="Possible Explanations for Pricing" />
              <BulletList items={report.possible_explanations} />
            </>
          )}

          {/* Comp Strategy */}
          {report.comp_strategy?.length > 0 && (
            <>
              <SectionHeader icon="🏘" title="Comp Strategy" />
              <BulletList items={report.comp_strategy} />
            </>
          )}

          {/* Mortgage Angle */}
          {report.mortgage_angle?.length > 0 && (
            <>
              <SectionHeader icon="🏦" title="Financing Considerations" />
              <BulletList items={report.mortgage_angle} />
            </>
          )}

          {/* Source Notes */}
          {report.source_notes?.length > 0 && (
            <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>
                Data Sources & Confidence
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {report.source_notes.map((note, i) => (
                  <li key={i} style={{ fontSize: '0.72rem', color: 'rgba(100,116,139,0.85)', lineHeight: 1.4 }}>· {note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Powered by */}
          <div style={{ marginTop: 18, display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center' }}>
            {['Grok 4', 'Tavily', 'GPT-4o'].map(lbl => (
              <span key={lbl} style={{
                fontSize: '0.55rem', padding: '2px 7px', borderRadius: 4,
                background: 'rgba(139,92,246,0.12)', color: 'rgba(167,139,250,0.7)',
                fontWeight: 700, letterSpacing: '0.05em',
              }}>{lbl}</span>
            ))}
          </div>

          {/* Disclaimer */}
          <div style={{
            marginTop: 14,
            fontSize: '0.65rem', color: 'rgba(71,85,105,0.8)', lineHeight: 1.5,
            padding: '10px 12px', borderRadius: 7,
            background: 'rgba(15,23,42,0.5)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            {report.disclaimer}
          </div>
        </div>
      </div>
    </div>
  );
}
