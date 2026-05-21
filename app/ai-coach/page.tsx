// app/ai-coach/page.tsx
// Marketing page for the AI Coach model — engineered prompts for interviewing LOs and agents
import type { Metadata } from 'next';
import Link from 'next/link';
import AppNav from '../components/AppNav';

export const metadata: Metadata = {
  title: 'AI Coach — Interview Your Lender and Agent With the Right Questions | HomeRates.AI',
  description: 'HomeRates AI Coach gives consumers engineered prompts to guide them through interviewing loan officers and real estate agents. Know what to ask, what the answers mean, and when to walk away.',
  alternates: { canonical: 'https://chat.homerates.ai/ai-coach' },
};

const LO_QUESTIONS = [
  {
    q: 'What is the APR, not just the rate?',
    why: 'The interest rate is the headline. APR folds in origination fees, points, and lender costs — it\'s the real cost of the loan. A lender quoting 6.5% rate with 1.5 points may be more expensive than a 6.75% rate with zero points.',
  },
  {
    q: 'What fees are in your Loan Estimate — and which are negotiable?',
    why: 'The Loan Estimate is a federal form the lender must give you within 3 business days. Origination charges, application fees, and document prep fees vary wildly between lenders. Third-party fees (title, escrow) are more fixed. Ask specifically which are negotiable.',
  },
  {
    q: 'How long is the rate lock, and what does it cost to extend?',
    why: 'A 30-day lock is standard but only covers quick closings. If your purchase is 45–60 days out, ask for a 45- or 60-day lock. Understand the extension cost before you agree to anything.',
  },
  {
    q: 'Do you sell loans after closing, or keep them in-house?',
    why: 'Most loans are sold to the secondary market. Your loan terms won\'t change, but your servicer might. Some borrowers prefer portfolio lenders who hold the loan — particularly on non-QM or jumbo products.',
  },
  {
    q: 'What is your current average time from application to clear-to-close?',
    why: 'A lender quoting 21 days who actually averages 35 will blow up your contract. Ask for a real number. If they can\'t give you one, that is your answer.',
  },
  {
    q: 'Are you a broker, a direct lender, or a correspondent lender?',
    why: 'Brokers shop your loan to multiple wholesale lenders and earn a commission. Direct lenders fund from their own balance sheet. Correspondents close in their name then sell. Each model has different speed, rate access, and flexibility trade-offs.',
  },
];

const AGENT_QUESTIONS = [
  {
    q: 'What is your list-price-to-sale-price ratio over the last 12 months?',
    why: 'A good listing agent consistently closes near or above list. A buyer\'s agent who consistently negotiates below list is the metric that matters for you. Ask for actual numbers — not anecdotes.',
  },
  {
    q: 'How many active clients are you working with right now?',
    why: 'An agent juggling 20 buyer clients cannot give you the attention a competitive market demands. 4–8 active clients is a healthy range for a solo agent. A team agent with admin support can handle more.',
  },
  {
    q: 'In this market, what offer strategy would you recommend — and why?',
    why: 'The answer reveals their market knowledge immediately. A qualified agent will reference DOM trends, recent overbid data, and escalation clause strategy. Vague answers like "it depends" without specifics are a red flag.',
  },
  {
    q: 'What contingencies would you recommend I waive or keep in this market?',
    why: 'Inspection, financing, and appraisal contingencies protect you but can weaken your offer in competitive markets. Understanding the risk calculus for each contingency — and the specific market conditions — is the agent\'s job.',
  },
  {
    q: 'How do you handle a multiple-offer situation?',
    why: 'Escalation clauses, personal letters, flexible close dates, lender pre-underwriting — there are real tactics here. An agent who says "you just offer more money" is not using the full toolkit.',
  },
  {
    q: 'What happens if I decide not to buy — do I owe you anything?',
    why: 'Since the NAR settlement changes took effect in 2024, buyer representation agreements are now required in most states. Know exactly what you\'ve signed, what the fee is, and how it\'s paid before you engage.',
  },
];

const PROMPT_TYPES = [
  {
    icon: '🏦',
    title: 'Lender Interview',
    desc: 'Six engineered prompts covering APR vs rate, Loan Estimate fee breakdown, lock period, servicer retention, underwriting speed, and lender model type. Context-aware: the AI adapts questions to your loan type (conventional, FHA, jumbo, DSCR).',
    seed: 'I want to interview my loan officer. Help me ask the right questions about fees, APR, rate lock, and underwriting timeline.',
    accent: '#00e87a',
  },
  {
    icon: '🤝',
    title: 'Agent Interview',
    desc: 'Six prompts covering list-to-sale ratio, capacity, offer strategy, contingency guidance, multiple-offer tactics, and buyer agreement terms. Calibrated to your market conditions based on the address you\'ve analysed.',
    seed: 'I want to interview a real estate agent before hiring them. Help me ask the right questions about their track record, strategy, and how they handle competitive offers.',
    accent: '#60a5fa',
  },
  {
    icon: '📋',
    title: 'Offer Strategy Debrief',
    desc: 'After your agent presents an offer strategy, use the AI Coach to pressure-test it. The prompts surface assumptions the agent made and help you understand what you\'re agreeing to before you sign.',
    seed: 'My agent just recommended an offer strategy. Help me understand it and ask the right follow-up questions.',
    accent: '#a78bfa',
  },
  {
    icon: '📊',
    title: 'Loan Estimate Review',
    desc: 'Paste your Loan Estimate into chat. The AI breaks down every line — origination charges, third-party fees, prepaid items, cash to close — and flags anything that looks elevated compared to market norms.',
    seed: 'I have a Loan Estimate from my lender. Help me review every line and understand what\'s negotiable.',
    accent: '#f59e0b',
  },
];

export default function AICoachPage() {
  return (
    <>
      <style>{`
        body:has(.aic-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.aic-root){height:auto!important;overflow:visible!important;}
        body:has(.aic-root) .app-footer{display:none!important;}
        .aic-root{min-height:100vh;width:100%;background:#080c12;color:#e0f0e8;
          font-family:var(--font-dm-sans,'DM Sans',sans-serif);
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;box-sizing:border-box;}
        .aic-root *{box-sizing:border-box;}

        .aic-header{position:sticky;top:0;z-index:50;width:100%;
          background:rgba(8,12,18,0.94);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(255,255,255,0.06);}
        .aic-header-inner{max-width:900px;margin:0 auto;padding:0 24px;height:56px;
          display:flex;align-items:center;justify-content:space-between;}
        .aic-logo-link{display:flex;align-items:center;text-decoration:none;}
        .aic-logo{height:26px;width:auto;}
        .aic-nav{display:flex;align-items:center;gap:20px;}
        .aic-nav-link{font-size:0.82rem;color:rgba(185,208,192,0.6);text-decoration:none;transition:color 0.15s;}
        .aic-nav-link:hover{color:#e0f0e8;}
        .aic-nav-cta{display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;
          font-weight:600;color:#00e87a;text-decoration:none;padding:6px 14px;
          border:1px solid rgba(0,232,122,0.3);border-radius:8px;transition:background 0.15s;}
        .aic-nav-cta:hover{background:rgba(0,232,122,0.08);}

        .aic-main{width:100%;max-width:900px;padding:60px 24px 100px;display:flex;flex-direction:column;gap:56px;}

        .aic-eyebrow{display:inline-block;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;background:rgba(0,232,122,0.08);
          border:1px solid rgba(0,232,122,0.2);border-radius:6px;padding:4px 10px;margin-bottom:16px;}
        .aic-h1{font-size:clamp(2rem,4.5vw,3.2rem);font-weight:900;color:#f0f4ff;
          line-height:1.08;margin:0 0 20px;letter-spacing:-0.02em;}
        .aic-subtitle{font-size:1.05rem;color:rgba(185,208,192,0.75);max-width:600px;
          margin:0 auto 28px;line-height:1.65;}
        .aic-hero-cta{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#07100f;font-size:0.95rem;font-weight:800;padding:13px 28px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .aic-hero-cta:hover{background:#00ff8a;}

        .aic-section-label{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;
          text-transform:uppercase;color:#00e87a;margin-bottom:10px;}
        .aic-section-h2{font-size:clamp(1.4rem,3vw,2rem);font-weight:800;color:#f0f4ff;
          margin:0 0 14px;letter-spacing:-0.015em;line-height:1.2;}
        .aic-section-body{font-size:0.95rem;color:rgba(185,208,192,0.8);line-height:1.7;}

        /* Prompt type cards */
        .aic-types-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:24px;}
        .aic-type-card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
          border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:10px;}
        .aic-type-icon{font-size:1.4rem;}
        .aic-type-title{font-size:0.92rem;font-weight:800;color:#f0f4ff;}
        .aic-type-desc{font-size:0.82rem;color:rgba(185,208,192,0.75);line-height:1.6;flex:1;}
        .aic-type-try{font-size:0.78rem;font-weight:600;text-decoration:none;padding:6px 12px;
          border-radius:8px;border:1px solid;display:inline-block;margin-top:4px;transition:background 0.15s;}

        /* Question lists */
        .aic-q-section{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
        .aic-q-block{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);
          border-radius:14px;padding:24px;}
        .aic-q-header{display:flex;align-items:center;gap:10px;margin-bottom:18px;}
        .aic-q-icon{font-size:1.3rem;}
        .aic-q-title{font-size:1rem;font-weight:800;color:#f0f4ff;}
        .aic-q-list{display:flex;flex-direction:column;gap:14px;}
        .aic-q-item{}
        .aic-q-text{font-size:0.88rem;font-weight:700;color:#f0f4ff;margin-bottom:4px;line-height:1.4;}
        .aic-q-why{font-size:0.8rem;color:rgba(185,208,192,0.7);line-height:1.55;}

        /* How it works */
        .aic-steps{display:flex;flex-direction:column;gap:12px;}
        .aic-step{display:flex;gap:16px;align-items:flex-start;}
        .aic-step-dot{width:28px;height:28px;border-radius:50%;background:rgba(0,232,122,0.1);
          border:1px solid rgba(0,232,122,0.2);color:#00e87a;font-size:0.8rem;font-weight:800;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;}
        .aic-step-body{}
        .aic-step-title{font-size:0.92rem;font-weight:700;color:#f0f4ff;margin-bottom:3px;}
        .aic-step-desc{font-size:0.85rem;color:rgba(185,208,192,0.7);line-height:1.6;}

        /* Context-aware callout */
        .aic-callout{background:rgba(0,232,122,0.05);border:1px solid rgba(0,232,122,0.15);
          border-radius:14px;padding:24px;}
        .aic-callout-h{font-size:1rem;font-weight:800;color:#f0f4ff;margin-bottom:8px;}
        .aic-callout-body{font-size:0.88rem;color:rgba(185,208,192,0.8);line-height:1.65;}

        /* CTA */
        .aic-cta{text-align:center;padding:40px;
          background:rgba(0,232,122,0.04);border:1px solid rgba(0,232,122,0.15);border-radius:18px;}
        .aic-cta-h{font-size:1.4rem;font-weight:800;color:#f0f4ff;margin:0 0 10px;}
        .aic-cta-sub{font-size:0.92rem;color:rgba(185,208,192,0.7);margin:0 0 24px;line-height:1.6;}
        .aic-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#00e87a;
          color:#07100f;font-size:0.95rem;font-weight:800;padding:14px 32px;
          border-radius:10px;text-decoration:none;transition:background 0.15s;}
        .aic-cta-btn:hover{background:#00ff8a;}

        .aic-footer{width:100%;border-top:1px solid rgba(255,255,255,0.06);padding:20px 24px;
          display:flex;align-items:center;justify-content:center;flex-wrap:wrap;
          gap:8px;font-size:0.78rem;color:rgba(185,208,192,0.4);}
        .aic-footer a{color:rgba(0,232,122,0.5);text-decoration:none;}
        .aic-footer a:hover{color:#00e87a;}
        .aic-footer-sep{opacity:0.4;}

        @media(max-width:640px){
          .aic-nav .aic-nav-link{display:none;}
          .aic-q-section{grid-template-columns:1fr;}
          .aic-types-grid{grid-template-columns:1fr 1fr;}
        }
      `}</style>

      <div className="aic-root">
        <header className="aic-header">
          <div className="aic-header-inner">
            <Link href="/" className="aic-logo-link">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.AI" className="aic-logo" />
            </Link>
            <nav className="aic-nav">
              <Link href="/platform" className="aic-nav-link">Platform Intelligence</Link>
              <Link href="/why-homerates" className="aic-nav-link">Why HomeRates</Link>
              <Link href="/chat" className="aic-nav-cta">Open AI Coach →</Link>
              <AppNav drawerOnly />
            </nav>
          </div>
        </header>

        <main className="aic-main">

          {/* Hero */}
          <div style={{ textAlign: 'center' }}>
            <span className="aic-eyebrow">AI Coach — Consumer Intelligence</span>
            <h1 className="aic-h1">Know What to Ask.<br />Before You Sign Anything.</h1>
            <p className="aic-subtitle">
              Most consumers walk into a lender meeting or agent interview with no playbook. AI Coach gives you engineered prompts — context-aware questions calibrated to your loan type, property, and market — so you interview from a position of knowledge, not guesswork.
            </p>
            <Link href="/chat?sq=I+want+to+interview+my+loan+officer.+Help+me+ask+the+right+questions+about+fees,+APR,+rate+lock,+and+underwriting+timeline." className="aic-hero-cta">
              Open AI Coach in chat →
            </Link>
          </div>

          {/* The problem */}
          <div>
            <div className="aic-section-label">The Problem</div>
            <h2 className="aic-section-h2">The information asymmetry is the entire game</h2>
            <p className="aic-section-body">
              A loan officer has underwritten thousands of loans. A buyer's agent has negotiated hundreds of offers. You've done this once, maybe twice. The gap in domain knowledge is the gap in outcome.
              <br /><br />
              That asymmetry is not accidental — it's the structural advantage the industry relies on. A consumer who doesn't know to ask about APR versus rate will compare quotes on rate alone. A buyer who doesn't understand escalation clause mechanics leaves money on the table in every offer.
              <br /><br />
              AI Coach doesn't make you an expert. It gives you the exact questions an expert would ask — and tells you what good and bad answers look like, so you can evaluate the response in real time.
            </p>
          </div>

          {/* Prompt types */}
          <div>
            <div className="aic-section-label">What AI Coach Covers</div>
            <h2 className="aic-section-h2">Four interview modes, each with engineered prompts</h2>
            <div className="aic-types-grid">
              {PROMPT_TYPES.map(t => (
                <div key={t.title} className="aic-type-card" style={{ borderTop: `3px solid ${t.accent}` }}>
                  <div className="aic-type-icon">{t.icon}</div>
                  <div className="aic-type-title">{t.title}</div>
                  <div className="aic-type-desc">{t.desc}</div>
                  <Link
                    href={`/chat?sq=${encodeURIComponent(t.seed)}`}
                    className="aic-type-try"
                    style={{ color: t.accent, borderColor: `${t.accent}40`, background: `${t.accent}08` }}
                  >
                    Start this mode →
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* The question banks */}
          <div>
            <div className="aic-section-label">The Question Banks</div>
            <h2 className="aic-section-h2">What you'll ask — and why each question matters</h2>
            <div className="aic-q-section" style={{ marginTop: 24 }}>
              <div className="aic-q-block">
                <div className="aic-q-header">
                  <span className="aic-q-icon">🏦</span>
                  <span className="aic-q-title">Interviewing Your Loan Officer</span>
                </div>
                <div className="aic-q-list">
                  {LO_QUESTIONS.map((item, i) => (
                    <div key={i} className="aic-q-item">
                      <div className="aic-q-text">"{item.q}"</div>
                      <div className="aic-q-why">{item.why}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="aic-q-block">
                <div className="aic-q-header">
                  <span className="aic-q-icon">🤝</span>
                  <span className="aic-q-title">Interviewing Your Agent</span>
                </div>
                <div className="aic-q-list">
                  {AGENT_QUESTIONS.map((item, i) => (
                    <div key={i} className="aic-q-item">
                      <div className="aic-q-text">"{item.q}"</div>
                      <div className="aic-q-why">{item.why}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Context-aware callout */}
          <div className="aic-callout">
            <div className="aic-callout-h">🎯 The questions adapt to your scenario</div>
            <div className="aic-callout-body">
              AI Coach isn't a static checklist. When you've analysed a property, run an affordability scenario, or identified your loan type in chat, the prompts update to reflect your context. Asking about a jumbo loan surfaces different fee and underwriting questions than a conventional. A seller's market triggers different agent strategy questions than a buyer's market. The coaching is live, not canned.
            </div>
          </div>

          {/* How it works */}
          <div>
            <div className="aic-section-label">How It Works</div>
            <h2 className="aic-section-h2">Three steps from question to answer</h2>
            <div className="aic-steps" style={{ marginTop: 20 }}>
              {[
                {
                  title: 'Choose your mode or just ask',
                  desc: 'Type "help me interview my LO" or "what should I ask my agent" in chat. Or use one of the direct links above. The AI recognises the intent and enters coaching mode.',
                },
                {
                  title: 'Get context-calibrated questions',
                  desc: 'The AI surfaces the six most important questions for your situation. Each question comes with a brief explanation of what you\'re probing for and what a strong versus weak answer looks like.',
                },
                {
                  title: 'Process the answer in real time',
                  desc: 'If you\'re not sure whether the answer you received from your LO or agent is good, paste it back. The AI evaluates it — identifies evasions, flags missing information, and tells you whether to push back or accept.',
                },
              ].map((step, i) => (
                <div key={i} className="aic-step">
                  <div className="aic-step-dot">{i + 1}</div>
                  <div className="aic-step-body">
                    <div className="aic-step-title">{step.title}</div>
                    <div className="aic-step-desc">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="aic-cta">
            <h2 className="aic-cta-h">Start your interview prep now</h2>
            <p className="aic-cta-sub">Open the AI Coach in chat. Free. No email. No forms. Works on any device.</p>
            <Link href="/chat?sq=I+want+to+interview+my+loan+officer.+Help+me+ask+the+right+questions+about+fees,+APR,+rate+lock,+and+underwriting+timeline." className="aic-cta-btn">
              Open AI Coach →
            </Link>
          </div>

        </main>

        <footer className="aic-footer">
          <span>HomeRates.AI — educational tool, not a lender or broker.</span>
          <span className="aic-footer-sep">•</span>
          <Link href="/platform">Platform Intelligence</Link>
          <span className="aic-footer-sep">•</span>
          <Link href="/about">About</Link>
          <span className="aic-footer-sep">•</span>
          <Link href="/disclosures">Terms</Link>
          <span className="aic-footer-sep">•</span>
          <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </>
  );
}
