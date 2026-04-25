"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import AppNav from "../../components/AppNav";

// ── Types ────────────────────────────────────────────────────────────────────

type Room = {
  id: string; property_address: string; status: string;
  offer_price: number | null; target_close_date: string | null;
  property_data: any; created_by: string; updated_at: string;
};
type Member = {
  id: string; role: string; user_id: string | null;
  display_name: string | null; email: string | null;
  invite_token: string; joined_at: string | null;
};
type Message = {
  id: string; sender_id: string; sender_role: string;
  sender_name: string | null; content: string; created_at: string;
};
type Scenario = {
  id: string; created_by: string; created_by_role: string;
  label: string | null; offer_price: number | null; down_pct: number | null;
  loan_type: string | null; rate: number | null; piti: number | null;
  result_json: any; created_at: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  shopping:"Shopping", offer:"Offer", contract:"In Contract",
  processing:"Processing", closed:"Closed", cancelled:"Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  shopping:"#3d8bff", offer:"#ff8c42", contract:"#a78bfa",
  processing:"#fbbf24", closed:"#00e87a", cancelled:"#6b7a99",
};
const ROLE_LABELS: Record<string, string> = { buyer:"Buyer", lo:"Loan Officer", agent:"Agent" };
const ROLE_COLORS: Record<string, string> = { buyer:"#3d8bff", lo:"#00e87a", agent:"#a78bfa" };
const STATUSES = ["shopping","offer","contract","processing","closed"] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : `$${(n/1000).toFixed(0)}k`;
}
function fmtMo(n: number) { return `$${n.toLocaleString()}/mo`; }
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

type LoanType = 'conventional' | 'va' | 'fha' | 'jumbo';

function vaFundingFeePct(downPct: number): number {
  if (downPct >= 10) return 1.4;
  if (downPct >= 5)  return 1.65;
  return 2.3;
}

function calcPITI(
  price: number, downPct: number, ratePct: number, termYears: number,
  annualTaxes: number, hoaMonthly: number,
  loanType: LoanType = 'conventional',
  fundingFeePct = 0,
  sellerCredit = 0,
  closingCosts = 0,
): {
  pi:number; taxes:number; ins:number; pmi:number; mip:number; hoa:number;
  fundingFee:number; total:number; loan:number; downPayment:number; cashToClose:number;
} | null {
  if (!(price > 0) || !(ratePct > 0) || !(termYears > 0)) return null;
  const downPayment = price * (downPct / 100);
  let loan = price - downPayment;

  // VA: roll funding fee into loan
  const fundingFee = loanType === 'va' ? Math.round(loan * (fundingFeePct / 100)) : 0;
  if (loanType === 'va') loan += fundingFee;

  // FHA: roll 1.75% upfront MIP into loan
  const fhaUpfront = loanType === 'fha' ? Math.round(loan * 0.0175) : 0;
  if (loanType === 'fha') loan += fhaUpfront;

  const r  = (ratePct / 100) / 12;
  const n  = termYears * 12;
  const pi = loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);

  const taxes = annualTaxes / 12;
  const ins   = (price * 0.003) / 12;
  const pmi   = loanType === 'conventional' && downPct < 20 ? (loan * 0.005) / 12 : 0;
  const mip   = loanType === 'fha' ? (loan * 0.0055) / 12 : 0;
  const hoa   = hoaMonthly;

  const cashToClose = downPayment + closingCosts - sellerCredit;

  return {
    pi:          Math.round(pi),
    taxes:       Math.round(taxes),
    ins:         Math.round(ins),
    pmi:         Math.round(pmi),
    mip:         Math.round(mip),
    hoa:         Math.round(hoa),
    fundingFee,
    total:       Math.round(pi + taxes + ins + pmi + mip + hoa),
    loan:        Math.round(loan),
    downPayment: Math.round(downPayment),
    cashToClose: Math.round(cashToClose),
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DealRoomPage() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const router  = useRouter();
  const params  = useParams();
  const roomId  = params?.id as string;

  const [room,      setRoom]      = React.useState<Room | null>(null);
  const [members,   setMembers]   = React.useState<Member[]>([]);
  const [messages,  setMessages]  = React.useState<Message[]>([]);
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [loading,   setLoading]   = React.useState(true);
  const [liveRate,       setLiveRate]       = React.useState<number | null>(null);
  const [activeTab,      setActiveTab]      = React.useState<"property"|"financing"|"ai"|"messages"|"team">("property");
  const [loNmls,         setLoNmls]         = React.useState<string | null>(null);
  const [loDisplayName,  setLoDisplayName]  = React.useState<string | null>(null);
  const [discAcked,      setDiscAcked]      = React.useState(true); // start true, check localStorage after mount

  // AI assistant
  const [aiMessages,  setAiMessages]  = React.useState<{role:'user'|'assistant'; content:string}[]>([]);
  const [aiInput,     setAiInput]     = React.useState("");
  const [aiStreaming, setAiStreaming]  = React.useState(false);
  const aiEndRef = React.useRef<HTMLDivElement>(null);

  // Messages
  const [draft,   setDraft]   = React.useState("");
  const [sending, setSending] = React.useState(false);
  const msgEndRef = React.useRef<HTMLDivElement>(null);

  // Invite
  const [inviteLinks,  setInviteLinks]  = React.useState<Record<string,string>>({});
  const [copiedRole,   setCopiedRole]   = React.useState<string|null>(null);
  const [inviteLoaded, setInviteLoaded] = React.useState(false);
  const [inviteNames,  setInviteNames]  = React.useState<Record<string,string>>({});
  const [inviteEmails, setInviteEmails] = React.useState<Record<string,string>>({});
  const [emailSentFor, setEmailSentFor] = React.useState<Record<string,boolean>>({});

  // Status
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  // Offer Confidence Score
  type ScoreSignal = { key:string; label:string; detail:string; points:number; max:number; status:'good'|'ok'|'warn' };
  const [scoreData,     setScoreData]     = React.useState<{ score:number; signals:ScoreSignal[]; narrative:string; rate:number|null } | null>(null);
  const [scoreLoading,  setScoreLoading]  = React.useState(false);

  // Financing / scenario modeler
  const [scenPrice,  setScenPrice]  = React.useState("");
  const [scenDown,   setScenDown]   = React.useState("10");
  const [scenTerm,   setScenTerm]   = React.useState("30");
  const [scenRate,   setScenRate]   = React.useState("");
  const [scenLabel,        setScenLabel]        = React.useState("");
  const [scenLoanType,     setScenLoanType]     = React.useState<LoanType>("conventional");
  const [scenFundingFee,   setScenFundingFee]   = React.useState("2.3");
  const [scenSellerCredit, setScenSellerCredit] = React.useState("");
  const [scenClosingCosts, setScenClosingCosts] = React.useState("");
  const [showAdvanced,     setShowAdvanced]     = React.useState(false);
  const [importScens,      setImportScens]      = React.useState<any[]>([]);
  const [showImport,       setShowImport]       = React.useState(false);
  const [importLoading,    setImportLoading]    = React.useState(false);
  const [savingScen,    setSavingScen]    = React.useState(false);
  const [loadedScenId,  setLoadedScenId]  = React.useState<string|null>(null);

  // Seed scenario modeler from latest saved scenario, falling back to room defaults
  React.useEffect(() => {
    if (!room || scenPrice) return;
    const latest = scenarios[0];
    const price = latest?.offer_price ?? room.offer_price ?? room.property_data?.price;
    if (price) setScenPrice(String(Math.round(price)));
    if (latest?.down_pct != null) setScenDown(String(latest.down_pct));
    if (latest?.loan_type && ["conventional","va","fha","jumbo"].includes(latest.loan_type))
      setScenLoanType(latest.loan_type as LoanType);
  }, [room, scenarios]);
  React.useEffect(() => {
    if (scenRate) return;
    const latestRate = scenarios[0]?.rate;
    if (latestRate) { setScenRate(String(latestRate)); return; }
    if (liveRate) setScenRate(liveRate.toFixed(2));
  }, [liveRate, scenarios]);

  // Suppresses the auto-recalc effect when loading a saved scenario (which carries its own fee)
  const skipFeeRecalcRef = React.useRef(false);

  // Auto-update VA funding fee when loan type or down% changes — skipped during scenario load
  React.useEffect(() => {
    if (skipFeeRecalcRef.current) { skipFeeRecalcRef.current = false; return; }
    if (scenLoanType === "va") {
      const dp = parseFloat(scenDown);
      setScenFundingFee((!isNaN(dp) ? vaFundingFeePct(dp) : 2.3).toFixed(2));
    }
  }, [scenLoanType, scenDown]);

  async function loadImportScens() {
    setImportLoading(true);
    try {
      const res = await fetch("/api/scenarios?my_referrals=1");
      if (!res.ok) return;
      const d = await res.json();
      const withCards = (d.scenarios ?? []).filter((s: any) => s.card_price && s.card_rate);
      setImportScens(withCards);
    } finally {
      setImportLoading(false);
    }
  }

  function applyImportedScenario(s: any) {
    if (s.card_price)   setScenPrice(String(s.card_price));
    if (s.card_dp_pct)  setScenDown(String(s.card_dp_pct));
    if (s.card_rate)    setScenRate(String(s.card_rate));
    if (s.card_term)    setScenTerm(String(s.card_term));
    if (s.loan_type && ["conventional","va","fha","jumbo"].includes(s.loan_type))
      setScenLoanType(s.loan_type as LoanType);
    setShowImport(false);
  }

  async function load() {
    const [roomRes, fredRes] = await Promise.all([
      fetch(`/api/deal-rooms/${roomId}`).then(r => r.json()),
      fetch("/api/fred").then(r => r.json()).catch(() => ({ ok: false })),
    ]);
    if (!roomRes.room) { router.replace("/deal-rooms"); return; }
    setRoom(roomRes.room);
    setMembers(roomRes.members ?? []);
    setMessages(roomRes.messages ?? []);
    setScenarios(roomRes.scenarios ?? []);
    if (roomRes.loNmls)        setLoNmls(roomRes.loNmls);
    if (roomRes.loDisplayName) setLoDisplayName(roomRes.loDisplayName);
    if (fredRes.ok && fredRes.mort30Avg) setLiveRate(fredRes.mort30Avg);
    setLoading(false);
    // Kick off score in background after room loads
    loadScore();
  }

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.replace("/sign-in"); return; }
    if (roomId) {
      // Show educational disclaimer banner once per room per browser
      const key = `dr_ack_${roomId}`;
      if (!localStorage.getItem(key)) setDiscAcked(false);
      load();
    }
  }, [isLoaded, isSignedIn, roomId]);

  React.useEffect(() => {
    if (activeTab === "messages") msgEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, activeTab]);

  React.useEffect(() => {
    if (activeTab === "ai") aiEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [aiMessages, activeTab]);

  async function sendAiMessage(content: string) {
    if (!content.trim() || aiStreaming) return;
    const userMsg = { role: "user" as const, content: content.trim() };
    const history = [...aiMessages, userMsg];
    setAiMessages([...history, { role: "assistant" as const, content: "" }]);
    setAiInput("");
    setAiStreaming(true);
    try {
      const res = await fetch(`/api/deal-rooms/${roomId}/ai`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        setAiMessages(p => { const u=[...p]; u[u.length-1]={role:"assistant",content:"Sorry, something went wrong. Please try again."}; return u; });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setAiMessages(p => { const u=[...p]; u[u.length-1]={role:"assistant",content:full}; return u; });
      }
    } finally {
      setAiStreaming(false);
    }
  }

  React.useEffect(() => {
    if (activeTab !== "messages") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/deal-rooms/${roomId}/messages`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages); }
    }, 8_000);
    return () => clearInterval(t);
  }, [activeTab, roomId]);

  async function sendMessage() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/deal-rooms/${roomId}/messages`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ content: draft }),
    });
    if (res.ok) {
      const d = await res.json();
      setMessages((p) => [...p, d.message]);
      setDraft("");
    }
    setSending(false);
  }

  async function loadScore() {
    setScoreLoading(true);
    try {
      const res = await fetch(`/api/deal-rooms/${roomId}/score`);
      if (res.ok) { const d = await res.json(); setScoreData(d); }
    } finally { setScoreLoading(false); }
  }

  async function advanceStatus() {
    if (!room || updatingStatus) return;
    const idx  = STATUSES.indexOf(room.status as any);
    const next = STATUSES[Math.min(idx + 1, STATUSES.length - 1)];
    if (next === room.status) return;
    setUpdatingStatus(true);
    const res = await fetch(`/api/deal-rooms/${roomId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) { const d = await res.json(); setRoom(d.room); }
    setUpdatingStatus(false);
  }

  async function loadInvites() {
    if (inviteLoaded) return;
    const res = await fetch(`/api/deal-rooms/${roomId}/invite`);
    if (!res.ok) return;
    const d   = await res.json();
    const map: Record<string,string> = {};
    for (const m of d.members as Member[]) {
      if (m.invite_token) map[m.role] = `${window.location.origin}/deal-rooms/join?token=${m.invite_token}`;
    }
    setInviteLinks(map);
    setInviteLoaded(true);
  }

  async function generateInvite(role: string) {
    const name  = inviteNames[role]?.trim()  || undefined;
    const email = inviteEmails[role]?.trim() || undefined;
    const res = await fetch(`/api/deal-rooms/${roomId}/invite`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ role, display_name: name, email }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.emailSent) setEmailSentFor(prev => ({ ...prev, [role]: true }));
    }
    setInviteLoaded(false);
    await loadInvites();
  }

  function copyInvite(role: string) {
    const link = inviteLinks[role];
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedRole(role);
    setTimeout(() => setCopiedRole(null), 2000);
  }

  const modelerRef = React.useRef<HTMLDivElement>(null);

  function loadScenIntoModeler(s: Scenario) {
    skipFeeRecalcRef.current = true; // prevent auto-recalc from overwriting saved fee
    if (s.offer_price) setScenPrice(String(Math.round(s.offer_price)));
    if (s.down_pct != null) setScenDown(String(s.down_pct));
    if (s.rate) setScenRate(String(s.rate));
    if (s.loan_type && ["conventional","va","fha","jumbo"].includes(s.loan_type ?? ""))
      setScenLoanType(s.loan_type as LoanType);
    if (s.result_json?.fundingFeePct != null) setScenFundingFee(String(s.result_json.fundingFeePct));
    setScenLabel("");
    setScenSellerCredit(s.result_json?.sellerCredit ? String(s.result_json.sellerCredit) : "");
    setScenClosingCosts(s.result_json?.closingCosts  ? String(s.result_json.closingCosts)  : "");
    setLoadedScenId(s.id);
    modelerRef.current?.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  async function deleteScenario(scenId: string) {
    await fetch(`/api/deal-rooms/${roomId}/scenarios?scenario_id=${scenId}`, { method:"DELETE" });
    setScenarios(p => p.filter(s => s.id !== scenId));
  }

  async function saveScenario() {
    if (savingScen) return;
    const price  = parseFloat(scenPrice.replace(/,/g, ""));
    const down   = parseFloat(scenDown);
    const rate   = parseFloat(scenRate);
    const term   = parseInt(scenTerm);
    const ffPct  = scenLoanType === "va" ? parseFloat(scenFundingFee) || 0 : 0;
    const credit = parseFloat(scenSellerCredit.replace(/,/g, "")) || 0;
    const cc     = parseFloat(scenClosingCosts.replace(/,/g, "")) || 0;
    if (isNaN(price) || isNaN(down) || isNaN(rate) || isNaN(term)) return;
    const pd      = room?.property_data;
    const taxes   = pd?.annualTaxes ?? price * 0.012;
    const hoa     = pd?.hoaMonthly  ?? 0;
    const pitiRes = calcPITI(price, down, rate, term, taxes, hoa, scenLoanType, ffPct, credit, cc);
    if (!pitiRes) return;
    setSavingScen(true);
    const loanLabel = scenLoanType === "conventional" ? "" : ` (${scenLoanType.toUpperCase()})`;
    const autoLabel = scenLabel.trim() || `${fmt(price)} ${down}% dn${loanLabel}`;
    const res = await fetch(`/api/deal-rooms/${roomId}/scenarios`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: autoLabel, offer_price: price, down_pct: down,
        loan_type: scenLoanType, rate, piti: pitiRes.total,
        result_json: { ...pitiRes, sellerCredit: credit, closingCosts: cc, fundingFeePct: ffPct },
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setScenarios((p) => [d.scenario, ...p]);
      setScenLabel("");
    }
    setSavingScen(false);
  }

  if (loading) return (
    <>
      <style>{`
        body:has(.dr-root){display:block!important;height:auto!important;overflow:visible!important;}
        html:has(.dr-root){height:auto!important;overflow:visible!important;}
      `}</style>
      <div className="dr-root" style={{ background:"#080c12", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif" }}>
        <p style={{ color:"#6b7a99", fontSize:14 }}>Loading room…</p>
      </div>
    </>
  );

  if (!room) return null;

  const color     = STATUS_COLOR[room.status] ?? "#6b7a99";
  const pd        = room.property_data;
  const isCreator = room.created_by === userId;
  const viewerMember = members.find(m => m.user_id === userId);
  const viewerRole   = isCreator ? 'lo' : (viewerMember?.role ?? 'buyer');
  const isLO         = viewerRole === 'lo';
  const isAgent      = viewerRole === 'agent';
  const unread    = messages.filter(m => m.sender_role !== "system").length;

  // Modeler live preview
  const modNum    = parseFloat(scenPrice.replace(/,/g, ""));
  const modDown   = parseFloat(scenDown);
  const modRate   = parseFloat(scenRate);
  const modTerm   = parseInt(scenTerm);
  const modFF     = scenLoanType === "va" ? parseFloat(scenFundingFee) || 0 : 0;
  const modCredit = parseFloat(scenSellerCredit.replace(/,/g, "")) || 0;
  const modCC     = parseFloat(scenClosingCosts.replace(/,/g, "")) || 0;
  const modTaxes  = pd?.annualTaxes ?? (!isNaN(modNum) ? modNum * 0.012 : 0);
  const modHoa    = pd?.hoaMonthly  ?? 0;
  const modPiti   = !isNaN(modNum) && !isNaN(modDown) && !isNaN(modRate) && !isNaN(modTerm)
    ? calcPITI(modNum, modDown, modRate, modTerm, modTaxes, modHoa, scenLoanType, modFF, modCredit, modCC) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500&family=DM+Mono&display=swap');

        body:has(.dr-root) { display:block!important; height:auto!important; overflow:visible!important; }
        html:has(.dr-root) { height:auto!important; overflow:visible!important; }
        body:has(.dr-root) .app-footer { display:none!important; }

        * { box-sizing:border-box; margin:0; padding:0; }

        .dr-root {
          min-height: 100vh;
          background: #080c12;
          color: #f0f4ff;
          font-family: 'DM Sans', sans-serif;
          display: flex;
          flex-direction: column;
        }

        /* ── Header ── */
        .dr-header {
          position: sticky; top:0; z-index:50;
          background: rgba(8,12,18,0.94);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          width: 100%;
        }
        .dr-header-inner {
          max-width: 900px; margin:0 auto;
          padding: 0 24px; height:56px;
          display:flex; align-items:center; gap:12px;
        }
        .dr-logo { height:26px; width:auto; display:block; }
        .dr-header-sep { width:1px; height:18px; background:rgba(255,255,255,0.1); flex-shrink:0; }
        .dr-header-addr {
          flex:1; font-size:14px; font-weight:500; color:#f0f4ff;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .dr-status-chip {
          font-size:11px; font-weight:600; padding:3px 10px; border-radius:20px;
          border:1px solid; flex-shrink:0; cursor:pointer;
          transition: opacity .15s;
        }
        .dr-status-chip:hover { opacity:.75; }

        /* ── Content ── */
        .dr-body { flex:1; max-width:900px; margin:0 auto; width:100%; padding:24px 24px 60px; }

        /* ── Two-column ── */
        .dr-cols { display:grid; grid-template-columns:1fr 220px; gap:20px; }
        @media(max-width:640px){ .dr-cols { grid-template-columns:1fr; } }

        /* ── Property snapshot strip ── */
        .dr-strip {
          background:#0e1420; border:1px solid rgba(255,255,255,0.07);
          border-radius:12px; padding:16px 20px; margin-bottom:20px;
          display:flex; flex-wrap:wrap; gap:20px; align-items:flex-start;
        }

        /* ── Cards ── */
        .dr-card { background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:20px; }

        /* ── Tabs ── */
        .dr-tabs { display:flex; gap:4px; margin-bottom:16px; flex-wrap:wrap; }
        .dr-tab { background:none; border:none; color:#6b7a99; font-size:13px; font-weight:500; padding:8px 14px; cursor:pointer; border-radius:8px; font-family:inherit; transition:color .15s,background .15s; }
        .dr-tab:hover { color:#f0f4ff; }
        .dr-tab.active { color:#f0f4ff; background:rgba(255,255,255,0.07); }

        /* ── Property data grid ── */
        .pd-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:14px; }
        .pd-item { background:#141b28; border-radius:8px; padding:12px 14px; }
        .pd-label { font-size:10px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:4px; }
        .pd-value { font-size:15px; font-weight:600; color:#f0f4ff; }

        /* ── Gap alert ── */
        .gap-alert { border-radius:10px; padding:14px 16px; margin-bottom:14px; }

        /* ── AI tab ── */
        .ai-thread { min-height:260px; max-height:440px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding:4px 0 8px; }
        .ai-msg-user { background:rgba(0,232,122,0.08); border:1px solid rgba(0,232,122,0.14); border-radius:10px; padding:10px 14px; max-width:85%; margin-left:auto; font-size:14px; line-height:1.5; }
        .ai-msg-ai { background:#141b28; border:1px solid rgba(255,255,255,0.07); border-left:2px solid #00e87a; border-radius:10px; padding:12px 14px; font-size:14px; line-height:1.7; color:#c8d8e8; }
        .ai-chip { background:#141b28; border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:7px 14px; font-size:12px; font-weight:500; color:#8fa3b8; cursor:pointer; font-family:inherit; transition:color .15s,border-color .15s,background .15s; }
        .ai-chip:hover { color:#f0f4ff; border-color:rgba(0,232,122,0.3); background:rgba(0,232,122,0.06); }
        @keyframes ai-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }

        /* ── Offer Score ── */
        .score-card { background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:20px; margin-bottom:14px; }
        .score-ring {
          width:64px; height:64px; border-radius:50%; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          font-family:'Syne',sans-serif; font-size:18px; font-weight:700;
          border:3px solid;
        }
        .score-bar-track { flex:1; height:5px; background:rgba(255,255,255,0.07); border-radius:99px; overflow:hidden; }
        .score-bar-fill  { height:100%; border-radius:99px; }
        .score-signal { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
        .score-signal:last-child { border-bottom:none; }
        .score-narrative { font-size:13px; color:#8fa3b8; line-height:1.65; margin-top:14px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.05); }

        /* ── Financing ── */
        .fin-rate-strip {
          display:flex; align-items:center; gap:8px; padding:10px 14px;
          background:rgba(0,232,122,0.06); border:1px solid rgba(0,232,122,0.12);
          border-radius:10px; margin-bottom:14px;
          font-size:13px; font-weight:500; color:#00e87a;
        }
        .fin-hero {
          background:#0e1420; border:1px solid rgba(255,255,255,0.07);
          border-radius:12px; padding:20px; margin-bottom:14px;
        }
        .fin-breakdown {
          display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:14px;
        }
        .fin-cell { background:#141b28; border-radius:8px; padding:10px 12px; }
        .fin-cell-label { font-size:10px; color:#3a4560; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:3px; }
        .fin-cell-value { font-size:14px; font-weight:600; color:#f0f4ff; }

        .mod-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
        @media(max-width:480px){ .mod-row { grid-template-columns:1fr; } }
        .dr-input { background:#141b28; border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#f0f4ff; font-size:14px; padding:10px 12px; width:100%; outline:none; font-family:inherit; }
        .dr-input:focus { border-color:#00e87a; }
        .dr-input::placeholder { color:#3a4560; }
        .dr-lbl { font-size:11px; color:#6b7a99; text-transform:uppercase; letter-spacing:.06em; font-weight:500; margin-bottom:5px; display:block; }
        .dr-select { background:#141b28; border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#f0f4ff; font-size:14px; padding:10px 12px; width:100%; outline:none; font-family:inherit; appearance:none; cursor:pointer; }
        .dr-select:focus { border-color:#00e87a; }

        .scen-list { display:flex; flex-direction:column; gap:8px; margin-top:14px; }
        .scen-card {
          background:#141b28; border:1px solid rgba(255,255,255,0.07);
          border-radius:10px; padding:12px 14px;
          display:flex; flex-direction:column; gap:8px;
        }
        .scen-card-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .scen-actions { display:flex; gap:6px; }
        .scen-btn { background:transparent; border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:4px 10px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; color:#6b7a99; transition:color .12s, border-color .12s; }
        .scen-btn:hover { color:#f0f4ff; border-color:rgba(255,255,255,0.2); }
        .scen-btn.load:hover { color:#00e87a; border-color:rgba(0,232,122,0.35); }
        .scen-btn.del:hover { color:#f87171; border-color:rgba(248,113,113,0.35); }

        /* ── Messages ── */
        .dr-thread { min-height:280px; max-height:460px; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
        .msg-sys { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:6px 14px; font-size:12px; color:#6b7a99; text-align:center; margin:0 auto; max-width:90%; }
        .msg-self { background:rgba(0,232,122,0.1); border:1px solid rgba(0,232,122,0.15); border-radius:10px; padding:10px 14px; max-width:75%; margin-left:auto; }
        .msg-other { background:#141b28; border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:10px 14px; max-width:75%; }
        .dr-compose { display:flex; gap:10px; align-items:flex-end; background:#0e1420; border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:10px; margin-top:10px; }
        .dr-compose textarea { flex:1; background:none; border:none; color:#f0f4ff; font-size:14px; font-family:inherit; resize:none; outline:none; line-height:1.5; max-height:120px; }
        .dr-compose textarea::placeholder { color:#3a4560; }

        /* ── Buttons ── */
        .dr-btn { background:#00e87a; color:#080c12; border:none; border-radius:8px; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; }
        .dr-btn:hover { background:#00c96a; }
        .dr-btn:disabled { opacity:.5; cursor:not-allowed; }
        .dr-ghost { background:transparent; color:#6b7a99; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; font-family:inherit; }
        .dr-ghost:hover { color:#f0f4ff; border-color:rgba(255,255,255,0.15); }

        /* ── Member pill ── */
        .member-pill { display:flex; align-items:center; gap:10px; padding:10px 12px; background:#141b28; border-radius:8px; margin-bottom:6px; }

        /* ── Invite link ── */
        .invite-url { background:#141b28; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:9px 12px; font-size:11px; color:#6b7a99; font-family:'DM Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }

        /* ── Right rail ── */
        .rail-card { background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:16px; margin-bottom:12px; }
        .rail-label { font-size:10px; color:#6b7a99; text-transform:uppercase; letter-spacing:.06em; margin-bottom:10px; display:block; }

        /* ── Footer ── */
        .dr-footer { border-top:1px solid rgba(255,255,255,0.06); padding:20px 24px; text-align:center; font-size:12px; color:rgba(185,208,192,0.35); }
      `}</style>

      <div className="dr-root">

        {/* ── Sticky header ── */}
        <header className="dr-header">
          <div className="dr-header-inner">
            <Link href="/" style={{ flexShrink:0, display:"flex", alignItems:"center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/HomeRates-Logo Green.png" alt="HomeRates.ai" className="dr-logo" />
            </Link>
            <div className="dr-header-sep" />
            <button
              onClick={() => router.push("/deal-rooms")}
              style={{ background:"none", border:"none", color:"#6b7a99", cursor:"pointer", fontSize:18, flexShrink:0, padding:"2px 0", lineHeight:1 }}
            >←</button>
            <span className="dr-header-addr">{room.property_address}</span>
            {isCreator ? (
              <button
                className="dr-status-chip"
                style={{ color, background:`${color}18`, borderColor:`${color}40` }}
                onClick={advanceStatus}
                title="Advance to next stage"
              >
                {STATUS_LABELS[room.status]}
              </button>
            ) : (
              <span className="dr-status-chip" style={{ color, background:`${color}18`, borderColor:`${color}40`, cursor:"default" }}>
                {STATUS_LABELS[room.status]}
              </span>
            )}
            <AppNav drawerOnly />
          </div>
        </header>

        {/* ── Body ── */}
        <div className="dr-body">

          {/* Educational disclaimer banner — shown once per room per browser */}
          {!discAcked && (
            <div style={{ background:"rgba(61,139,255,0.08)", border:"1px solid rgba(61,139,255,0.2)", borderRadius:10, padding:"12px 16px", marginBottom:20, display:"flex", alignItems:"flex-start", gap:12 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>ℹ️</span>
              <p style={{ fontSize:13, color:"#8fa3b8", lineHeight:1.6, flex:1 }}>
                This workspace contains <strong style={{ color:"#f0f4ff" }}>educational payment estimates</strong> for planning purposes. They are not a Loan Estimate, commitment to lend, or pre-approval under RESPA/TRID. Actual rates and costs are subject to credit qualification.
              </p>
              <button
                onClick={() => { localStorage.setItem(`dr_ack_${roomId}`, "1"); setDiscAcked(true); }}
                style={{ background:"none", border:"none", color:"#6b7a99", cursor:"pointer", fontSize:16, padding:0, flexShrink:0, lineHeight:1 }}
              >✕</button>
            </div>
          )}

          {/* Property snapshot strip */}
          {pd && (
            <div className="dr-strip">
              {pd.price          && <SnapStat label="List Price"   value={fmt(pd.price)} />}
              {pd.estimatedValue && <SnapStat label="AVM"          value={fmt(pd.estimatedValue)} />}
              {pd.beds           && <SnapStat label="Beds"         value={String(pd.beds)} />}
              {pd.baths          && <SnapStat label="Baths"        value={String(pd.baths)} />}
              {pd.sqft           && <SnapStat label="Sqft"         value={pd.sqft.toLocaleString()} />}
              {pd.listingStatus  && <SnapStat label="Status"       value={pd.listingStatus.replace(/_/g," ")} />}
              {pd.daysOnMarket != null && <SnapStat label="Days Listed" value={String(pd.daysOnMarket)} />}
              {room.offer_price  && <SnapStat label="Offer"        value={fmt(room.offer_price)} accent />}
            </div>
          )}

          <div className="dr-cols">

            {/* ── Left: tabs ── */}
            <div>
              <div className="dr-tabs">
                <button className={`dr-tab${activeTab==="property"?" active":""}`} onClick={() => setActiveTab("property")}>
                  Property
                </button>
                <button className={`dr-tab${activeTab==="financing"?" active":""}`} onClick={() => setActiveTab("financing")}>
                  Financing{scenarios.length > 0 ? ` · ${scenarios.length}` : ""}
                </button>
                {!isAgent && (
                  <button className={`dr-tab${activeTab==="ai"?" active":""}`} onClick={() => setActiveTab("ai")}>
                    AI{aiMessages.length > 0 ? ` · ${Math.ceil(aiMessages.length/2)}` : ""}
                  </button>
                )}
                <button className={`dr-tab${activeTab==="messages"?" active":""}`} onClick={() => setActiveTab("messages")}>
                  Messages{unread > 0 ? ` · ${unread}` : ""}
                </button>
                {!isAgent && (
                  <button
                    className={`dr-tab${activeTab==="team"?" active":""}`}
                    onClick={() => { setActiveTab("team"); loadInvites(); }}
                  >
                    Team · {members.filter(m=>m.joined_at).length}/{members.length}
                  </button>
                )}
              </div>

              {/* ── Property tab ── */}
              {activeTab === "property" && (
                <div>
                  {/* Offer Confidence Score */}
                  <OfferScoreCard
                    scoreData={scoreData}
                    loading={scoreLoading}
                    onLoad={loadScore}
                    roomId={roomId}
                  />

                  {pd?.price && pd?.estimatedValue && (() => {
                    const gap    = pd.price - pd.estimatedValue;
                    const gapPct = (gap / pd.estimatedValue) * 100;
                    const over   = gapPct > 0;
                    const bgColor = over ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
                    const txColor = over ? "#f87171" : "#4ade80";
                    return (
                      <div className="gap-alert" style={{ background:bgColor, border:`1px solid ${txColor}22` }}>
                        <p style={{ fontSize:13, fontWeight:600, color:txColor, marginBottom:4 }}>
                          {over ? "⚠ Listed above AVM" : "✓ Listed below AVM"} — {Math.abs(gapPct).toFixed(1)}% {over?"premium":"discount"}
                        </p>
                        <p style={{ fontSize:13, color:"#6b7a99" }}>
                          {over
                            ? `List price is ${fmt(gap)} above the estimated value. Negotiate or request concessions.`
                            : `List price is ${fmt(Math.abs(gap))} below estimated value. Stronger buying position.`}
                        </p>
                      </div>
                    );
                  })()}

                  {pd ? (
                    <div className="dr-card">
                      <div className="pd-grid">
                        {pd.price           && <PdCell label="List Price"         value={fmt(pd.price)} />}
                        {pd.estimatedValue  && <PdCell label="AVM Estimate"       value={fmt(pd.estimatedValue)} />}
                        {pd.estimatedValueLow && pd.estimatedValueHigh && (
                          <PdCell label="AVM Range" value={`${fmt(pd.estimatedValueLow)}–${fmt(pd.estimatedValueHigh)}`} />
                        )}
                        {pd.lastSalePrice   && <PdCell label="Last Sale Price"    value={fmt(pd.lastSalePrice)} />}
                        {pd.lastSaleDate    && <PdCell label="Last Sale Date"     value={pd.lastSaleDate} />}
                        {pd.beds            && <PdCell label="Bedrooms"           value={String(pd.beds)} />}
                        {pd.baths           && <PdCell label="Bathrooms"          value={String(pd.baths)} />}
                        {pd.sqft            && <PdCell label="Sq Ft"              value={pd.sqft.toLocaleString()} />}
                        {pd.pricePerSqft    && <PdCell label="Price / Sq Ft"      value={`$${pd.pricePerSqft}`} />}
                        {pd.daysOnMarket != null && <PdCell label="Days on Market" value={String(pd.daysOnMarket)} />}
                        {pd.hoaMonthly      && <PdCell label="HOA / mo"           value={`$${pd.hoaMonthly.toLocaleString()}`} />}
                        {pd.estimatedBalance && <PdCell label="Est. Balance"      value={fmt(pd.estimatedBalance)} />}
                        {pd.purchaseRate    && <PdCell label="Purchase Rate"      value={`${pd.purchaseRate}%`} />}
                        {pd.annualTaxes     && <PdCell label="Annual Taxes"       value={`$${pd.annualTaxes.toLocaleString()}`} />}
                      </div>
                      {room.target_close_date && (
                        <p style={{ fontSize:12, color:"#6b7a99", marginTop:16, borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:12 }}>
                          Target close: <span style={{ color:"#f0f4ff", fontWeight:500 }}>
                            {new Date(room.target_close_date).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
                          </span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="dr-card">
                      <p style={{ fontSize:14, color:"#6b7a99", textAlign:"center", padding:"32px 0" }}>
                        No property data loaded yet.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Financing tab ── */}
              {activeTab === "financing" && (
                <div>
                  {/* Live rate strip — LO only (agents/buyers see the LO's saved scenarios, not raw rate tools) */}
                  {isLO && <div className="fin-rate-strip">
                    <span style={{ fontSize:16 }}>📈</span>
                    {liveRate
                      ? <><strong>{liveRate.toFixed(2)}%</strong>&nbsp;30Y Fixed&nbsp;<span style={{ color:"#4a6e58", fontSize:12 }}>· FRED national avg — not a rate lock or offer</span></>
                      : <span style={{ color:"#6b7a99" }}>Loading live rate…</span>
                    }
                  </div>}

                  {/* ── Agent/Buyer read-only view ── */}
                  {!isLO && (
                    <div>
                      <div className="dr-card" style={{ marginBottom:14 }}>
                        <p style={{ fontSize:11, color:"#6b7a99", textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>
                          Financing Scenarios · Prepared by Loan Officer
                        </p>
                        {scenarios.length === 0 ? (
                          <p style={{ fontSize:14, color:"#3a4560", textAlign:"center", padding:"24px 0" }}>
                            No financing scenarios shared yet. Check back after your loan officer models the deal.
                          </p>
                        ) : (
                          <div className="scen-list" style={{ marginTop:0 }}>
                            {scenarios.map((s) => {
                              const rc = ROLE_COLORS[s.created_by_role] ?? "#6b7a99";
                              const rj = s.result_json ?? {};
                              return (
                                <div key={s.id} className="scen-card">
                                  <div className="scen-card-row">
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                                        <p style={{ fontSize:13, fontWeight:600, color:"#f0f4ff" }}>
                                          {s.label ?? (s.offer_price ? `Offer at ${fmt(s.offer_price)}` : "Scenario")}
                                        </p>
                                        <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:4, background:"rgba(255,255,255,0.05)", color:"#3a4560", letterSpacing:".06em" }}>EST</span>
                                        {s.loan_type && s.loan_type !== "conventional" && (
                                          <span style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4, background:"rgba(167,139,250,0.1)", color:"#a78bfa", letterSpacing:".06em", textTransform:"uppercase" }}>{s.loan_type}</span>
                                        )}
                                      </div>
                                      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 12px", marginBottom:8 }}>
                                        {s.offer_price && <span style={{ fontSize:12, color:"#6b7a99" }}>{fmt(s.offer_price)}</span>}
                                        {s.down_pct != null && <span style={{ fontSize:12, color:"#6b7a99" }}>{s.down_pct}% down</span>}
                                        {s.rate && <span style={{ fontSize:12, color:"#6b7a99" }}>{s.rate}% rate</span>}
                                        <span style={{ fontSize:12, color:"#3a4560" }}>{timeAgo(s.created_at)}</span>
                                      </div>
                                      {/* Full PITI breakdown for read-only view */}
                                      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 14px" }}>
                                        {rj.pi    > 0 && <span style={{ fontSize:12, color:"#8b949e" }}>P&I ${rj.pi?.toLocaleString()}</span>}
                                        {rj.taxes > 0 && <span style={{ fontSize:12, color:"#8b949e" }}>Tax ${rj.taxes?.toLocaleString()}</span>}
                                        {rj.ins   > 0 && <span style={{ fontSize:12, color:"#8b949e" }}>Ins ${rj.ins?.toLocaleString()}</span>}
                                        {rj.pmi   > 0 && <span style={{ fontSize:12, color:"#fbbf24" }}>PMI ${rj.pmi?.toLocaleString()}</span>}
                                        {rj.mip   > 0 && <span style={{ fontSize:12, color:"#fbbf24" }}>MIP ${rj.mip?.toLocaleString()}</span>}
                                        {rj.hoa   > 0 && <span style={{ fontSize:12, color:"#8b949e" }}>HOA ${rj.hoa?.toLocaleString()}</span>}
                                      </div>
                                      {rj.cashToClose > 0 && (
                                        <p style={{ fontSize:12, color:"#6b7a99", marginTop:6 }}>
                                          Est. cash to close: <span style={{ color:"#f0f4ff", fontWeight:600 }}>${rj.cashToClose?.toLocaleString()}</span>
                                          <span style={{ color:"#3a4560" }}> · actual costs vary</span>
                                        </p>
                                      )}
                                    </div>
                                    <div style={{ textAlign:"right", flexShrink:0 }}>
                                      {s.piti && (
                                        <p style={{ fontSize:20, fontWeight:700, color:"#00e87a", fontFamily:"'Syne',sans-serif" }}>
                                          ${s.piti.toLocaleString()}/mo
                                        </p>
                                      )}
                                      <span style={{ fontSize:11, fontWeight:600, color:rc }}>{ROLE_LABELS[s.created_by_role] ?? s.created_by_role}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <p style={{ fontSize:11, color:"#3a4560", marginTop:14, lineHeight:1.5 }}>
                          Estimates are for illustrative purposes only — not a Loan Estimate or commitment to lend under RESPA/TRID.
                          {loNmls ? <> Prepared by {loDisplayName ?? "Loan Officer"} · NMLS #{loNmls}.</> : null}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── LO-only: PITI hero + modeler ── */}
                  {/* PITI hero — reflects active modeler values */}
                  {isLO && modPiti ? (
                    <div className="fin-hero">
                      <p style={{ fontSize:11, color:"#6b7a99", textTransform:"uppercase", letterSpacing:".06em", marginBottom:8 }}>
                        Est. Payment — {scenDown}% dn · {scenTerm}Y · {scenRate}% · <span style={{ color:"#3a4560" }}>Illustration only</span>
                      </p>
                      <p style={{ fontSize:36, fontFamily:"'Syne',sans-serif", fontWeight:700, color:"#00e87a", lineHeight:1 }}>
                        {fmtMo(modPiti.total)}
                      </p>
                      <div className="fin-breakdown">
                        <div className="fin-cell">
                          <p className="fin-cell-label">P&amp;I</p>
                          <p className="fin-cell-value">${modPiti.pi.toLocaleString()}</p>
                        </div>
                        <div className="fin-cell">
                          <p className="fin-cell-label">Property Tax</p>
                          <p className="fin-cell-value">${modPiti.taxes.toLocaleString()}</p>
                        </div>
                        <div className="fin-cell">
                          <p className="fin-cell-label">Insurance</p>
                          <p className="fin-cell-value">${modPiti.ins.toLocaleString()}</p>
                        </div>
                        {modPiti.pmi > 0 && (
                          <div className="fin-cell">
                            <p className="fin-cell-label">PMI</p>
                            <p className="fin-cell-value">${modPiti.pmi.toLocaleString()}</p>
                          </div>
                        )}
                        {modPiti.hoa > 0 && (
                          <div className="fin-cell">
                            <p className="fin-cell-label">HOA</p>
                            <p className="fin-cell-value">${modPiti.hoa.toLocaleString()}</p>
                          </div>
                        )}
                        <div className="fin-cell" style={{ background:"rgba(0,232,122,0.08)", border:"1px solid rgba(0,232,122,0.15)" }}>
                          <p className="fin-cell-label" style={{ color:"#00e87a" }}>Total PITI</p>
                          <p className="fin-cell-value" style={{ color:"#00e87a" }}>${modPiti.total.toLocaleString()}</p>
                        </div>
                      </div>
                      <p style={{ fontSize:11, color:"#3a4560", marginTop:12 }}>
                        Loan amount: {fmt(modPiti.loan)} · {modPiti.taxes > 0 ? "taxes from property record" : "taxes estimated at 1.2%"} · insurance at 0.3%{modPiti.pmi > 0 ? " · PMI included (<20% down)" : ""}
                      </p>
                    </div>
                  ) : isLO ? (
                    <div className="dr-card" style={{ marginBottom:14 }}>
                      <p style={{ fontSize:13, color:"#6b7a99", textAlign:"center", padding:"20px 0" }}>Enter price, rate, and down payment below to see the PITI preview.</p>
                    </div>
                  ) : null}

                  {/* Scenario modeler — LO only */}
                  {isLO && <div className="dr-card" ref={modelerRef}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                      <p style={{ fontSize:13, fontWeight:600, color:"#f0f4ff" }}>Model a Scenario</p>
                      <button
                        style={{ background:"none", border:"none", color:"#3d8bff", fontSize:12, cursor:"pointer", fontFamily:"inherit", padding:0 }}
                        onClick={() => { setShowImport(!showImport); if (!importScens.length && !showImport) loadImportScens(); }}
                      >
                        {showImport ? "✕ Close" : "↓ Import from my scenarios"}
                      </button>
                    </div>

                    {/* Import picker */}
                    {showImport && (
                      <div style={{ background:"#141b28", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:12, marginBottom:14 }}>
                        {importLoading && <p style={{ fontSize:12, color:"#6b7a99" }}>Loading your scenarios…</p>}
                        {!importLoading && importScens.length === 0 && (
                          <p style={{ fontSize:12, color:"#6b7a99" }}>No scenarios with card data found. Save a scenario in the LO portal first.</p>
                        )}
                        {importScens.map((s: any) => (
                          <div
                            key={s.id}
                            onClick={() => applyImportedScenario(s)}
                            style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", borderRadius:8, cursor:"pointer", marginBottom:4, background:"rgba(255,255,255,0.03)" }}
                          >
                            <div>
                              <span style={{ fontSize:12, fontWeight:600, color:s.loan_type==="va"?"#a78bfa":s.loan_type==="fha"?"#fbbf24":"#00e87a", marginRight:8 }}>
                                {(s.loan_type ?? "CONV").toUpperCase()}
                              </span>
                              <span style={{ fontSize:12, color:"#f0f4ff" }}>
                                {s.card_price ? `$${Number(s.card_price).toLocaleString()}` : s.price_range}
                              </span>
                            </div>
                            <span style={{ fontSize:12, color:"#6b7a99" }}>
                              {s.card_dp_pct}% dn · {s.card_rate}% · ${Number(s.card_monthly ?? 0).toLocaleString()}/mo
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Row 1: Loan type + offer price */}
                    <div className="mod-row">
                      <div>
                        <span className="dr-lbl">Loan Type</span>
                        <select className="dr-select" value={scenLoanType} onChange={e => { setScenLoanType(e.target.value as LoanType); setLoadedScenId(null); }}>
                          <option value="conventional">Conventional</option>
                          <option value="va">VA</option>
                          <option value="fha">FHA</option>
                          <option value="jumbo">Jumbo</option>
                        </select>
                      </div>
                      <div>
                        <span className="dr-lbl">Offer Price ($)</span>
                        <input
                          className="dr-input"
                          placeholder={pd?.price ? String(Math.round(pd.price)) : "750000"}
                          value={scenPrice}
                          onChange={e => { setScenPrice(e.target.value); setLoadedScenId(null); }}
                        />
                      </div>
                    </div>

                    {/* Row 2: Down + Rate */}
                    <div className="mod-row">
                      <div>
                        <span className="dr-lbl">Down Payment (%)</span>
                        <input className="dr-input" type="number" min="0" max="100" step="0.5" value={scenDown} onChange={e => { setScenDown(e.target.value); setLoadedScenId(null); }} />
                      </div>
                      <div>
                        <span className="dr-lbl">Rate (%)</span>
                        <input className="dr-input" type="number" step="0.01" placeholder={liveRate ? liveRate.toFixed(2) : "6.75"} value={scenRate} onChange={e => { setScenRate(e.target.value); setLoadedScenId(null); }} />
                      </div>
                    </div>

                    {/* Row 3: Term + VA funding fee */}
                    <div className="mod-row">
                      <div>
                        <span className="dr-lbl">Term</span>
                        <select className="dr-select" value={scenTerm} onChange={e => { setScenTerm(e.target.value); setLoadedScenId(null); }}>
                          <option value="30">30 Year</option>
                          <option value="15">15 Year</option>
                          <option value="20">20 Year</option>
                          <option value="10">10 Year</option>
                        </select>
                      </div>
                      {scenLoanType === "va" && (
                        <div>
                          <span className="dr-lbl">VA Funding Fee (%)</span>
                          <input className="dr-input" type="number" step="0.01" value={scenFundingFee} onChange={e => setScenFundingFee(e.target.value)} />
                        </div>
                      )}
                    </div>
                    {scenLoanType === "va" && (
                      <p style={{ fontSize:11, color:"#6b7a99", marginTop:-8, marginBottom:12 }}>
                        Auto-calculated · 0% if service-connected disability — override as needed
                      </p>
                    )}
                    {scenLoanType === "fha" && (
                      <p style={{ fontSize:11, color:"#6b7a99", marginBottom:12 }}>
                        FHA: 1.75% upfront MIP rolled into loan · 0.55% annual MIP included in monthly
                      </p>
                    )}

                    {/* Advanced toggle */}
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      style={{ background:"none", border:"none", color:"#6b7a99", fontSize:12, cursor:"pointer", fontFamily:"inherit", padding:"0 0 12px", display:"flex", alignItems:"center", gap:4 }}
                    >
                      {showAdvanced ? "▾" : "▸"} Seller credit &amp; closing costs
                    </button>

                    {showAdvanced && (
                      <div className="mod-row" style={{ marginTop:-4 }}>
                        <div>
                          <span className="dr-lbl">Seller Credit ($)</span>
                          <input className="dr-input" placeholder="e.g. 15000" value={scenSellerCredit} onChange={e => setScenSellerCredit(e.target.value)} />
                        </div>
                        <div>
                          <span className="dr-lbl">Est. Closing Costs ($)</span>
                          <input className="dr-input" placeholder="e.g. 12000" value={scenClosingCosts} onChange={e => setScenClosingCosts(e.target.value)} />
                        </div>
                      </div>
                    )}

                    {/* Live preview */}
                    {modPiti && (
                      <div style={{ background:"rgba(0,232,122,0.05)", border:"1px solid rgba(0,232,122,0.12)", borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                        <span style={{ fontSize:10, fontWeight:700, letterSpacing:".08em", color:"#3a4560", textTransform:"uppercase", display:"block", marginBottom:6 }}>Estimate — not a Loan Estimate</span>
                        <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
                          <span style={{ fontSize:24, fontFamily:"'Syne',sans-serif", fontWeight:700, color:"#00e87a" }}>${modPiti.total.toLocaleString()}/mo</span>
                          <span style={{ fontSize:12, color:"#4a6e58" }}>total PITI</span>
                          <span style={{ fontSize:11, fontWeight:600, padding:"2px 7px", borderRadius:99, background:"rgba(167,139,250,0.12)", color:"#a78bfa", marginLeft:4 }}>
                            {scenLoanType.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 16px", marginBottom: (modPiti.fundingFee > 0 || modPiti.mip > 0 || modPiti.cashToClose !== modPiti.downPayment) ? 8 : 0 }}>
                          <span style={{ fontSize:12, color:"#6b7a99" }}>P&I ${modPiti.pi.toLocaleString()}</span>
                          <span style={{ fontSize:12, color:"#6b7a99" }}>Tax ${modPiti.taxes.toLocaleString()}</span>
                          <span style={{ fontSize:12, color:"#6b7a99" }}>Ins ${modPiti.ins.toLocaleString()}</span>
                          {modPiti.pmi > 0 && <span style={{ fontSize:12, color:"#fbbf24" }}>PMI ${modPiti.pmi.toLocaleString()}</span>}
                          {modPiti.mip > 0 && <span style={{ fontSize:12, color:"#fbbf24" }}>MIP ${modPiti.mip.toLocaleString()}</span>}
                          {modPiti.hoa > 0 && <span style={{ fontSize:12, color:"#6b7a99" }}>HOA ${modPiti.hoa.toLocaleString()}</span>}
                        </div>
                        {modPiti.fundingFee > 0 && (
                          <p style={{ fontSize:11, color:"#a78bfa", marginBottom:6 }}>
                            VA funding fee ${modPiti.fundingFee.toLocaleString()} rolled into loan · Financed amt ${modPiti.loan.toLocaleString()}
                          </p>
                        )}
                        {(modCC > 0 || modCredit > 0) && (
                          <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:8, marginTop:4 }}>
                            <p style={{ fontSize:12, fontWeight:600, color:"#f0f4ff", marginBottom:3 }}>
                              Est. Cash to Close: <span style={{ color:"#00e87a" }}>${modPiti.cashToClose.toLocaleString()}</span>
                            </p>
                            <p style={{ fontSize:11, color:"#6b7a99" }}>
                              Down ${modPiti.downPayment.toLocaleString()}
                              {modCC > 0 ? ` + Closing ${fmt(modCC)}` : ""}
                              {modCredit > 0 ? ` − Seller Credit ${fmt(modCredit)}` : ""}
                              &nbsp;· actual costs vary
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ marginBottom:12 }}>
                      <span className="dr-lbl">Scenario Name (optional)</span>
                      <input
                        className="dr-input"
                        placeholder={modPiti && !isNaN(modNum) ? `${fmt(modNum)} ${scenDown}% dn (${scenLoanType.toUpperCase()})` : "e.g. VA offer with $15k seller credit…"}
                        value={scenLabel}
                        onChange={e => setScenLabel(e.target.value)}
                      />
                    </div>

                    <button className="dr-btn" style={{ width:"100%" }} onClick={saveScenario} disabled={savingScen || !modPiti}>
                      {savingScen ? "Saving…" : "Save Scenario — share with team"}
                    </button>
                  </div>}

                  {/* Saved scenarios — LO view with Load/Delete actions */}
                  {isLO && scenarios.length > 0 && (
                    <div style={{ marginTop:14 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <p style={{ fontSize:11, color:"#3a4560", textTransform:"uppercase", letterSpacing:".08em" }}>Saved Scenarios</p>
                        <span style={{ fontSize:10, color:"#3a4560" }}>Payment estimates only</span>
                      </div>
                      <div className="scen-list">
                        {scenarios.map((s) => {
                          const rc = ROLE_COLORS[s.created_by_role] ?? "#6b7a99";
                          const isOwn = s.created_by === userId;
                          return (
                            <div key={s.id} className="scen-card">
                              <div className="scen-card-row">
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                                    <p style={{ fontSize:13, fontWeight:500, color:"#f0f4ff" }}>
                                      {s.label ?? (s.offer_price ? `Offer at ${fmt(s.offer_price)}` : "Scenario")}
                                    </p>
                                    <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:4, background:"rgba(255,255,255,0.05)", color:"#3a4560", letterSpacing:".06em" }}>EST</span>
                                  </div>
                                  <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 12px" }}>
                                    {s.offer_price && <span style={{ fontSize:12, color:"#6b7a99" }}>{fmt(s.offer_price)}</span>}
                                    {s.down_pct != null && <span style={{ fontSize:12, color:"#6b7a99" }}>{s.down_pct}% dn</span>}
                                    {s.rate        && <span style={{ fontSize:12, color:"#6b7a99" }}>{s.rate}%</span>}
                                    {s.loan_type && s.loan_type !== "conventional" && <span style={{ fontSize:11, color:"#6b7a99", textTransform:"uppercase" }}>{s.loan_type}</span>}
                                    <span style={{ fontSize:12, color:"#3a4560" }}>{timeAgo(s.created_at)}</span>
                                  </div>
                                </div>
                                <div style={{ textAlign:"right", flexShrink:0 }}>
                                  {s.piti && (
                                    <p style={{ fontSize:16, fontWeight:700, color:"#00e87a", fontFamily:"'Syne',sans-serif" }}>
                                      ${s.piti.toLocaleString()}/mo
                                    </p>
                                  )}
                                  <span style={{ fontSize:11, fontWeight:600, color:rc }}>{ROLE_LABELS[s.created_by_role] ?? s.created_by_role}</span>
                                </div>
                              </div>
                              <div className="scen-actions" style={{ alignItems:"center" }}>
                                {loadedScenId === s.id && (
                                  <span style={{ fontSize:10, fontWeight:700, color:"#00e87a", letterSpacing:".06em", marginRight:4 }}>● In modeler</span>
                                )}
                                <button
                                  className="scen-btn load"
                                  onClick={() => loadScenIntoModeler(s)}
                                  title="Load these numbers into the modeler above"
                                >
                                  ↑ Load into modeler
                                </button>
                                {isOwn && (
                                  <button
                                    className="scen-btn del"
                                    onClick={() => deleteScenario(s.id)}
                                    title="Delete this scenario"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p style={{ fontSize:11, color:"#3a4560", marginTop:10, lineHeight:1.5 }}>
                        Estimates are for illustrative purposes only. Not a commitment to lend or a Loan Estimate under RESPA/TRID.
                        {loNmls
                          ? <> Prepared by {loDisplayName ?? "Loan Officer"} · NMLS #{loNmls}.</>
                          : <> Loan officer NMLS # not on file — update your profile.</>
                        }
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── AI tab ── */}
              {activeTab === "ai" && (
                <div className="dr-card" style={{ display:"flex", flexDirection:"column", gap:0, padding:0 }}>
                  {/* Header */}
                  <div style={{ padding:"14px 18px 12px", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:16 }}>✦</span>
                      <p style={{ fontSize:13, fontWeight:600, color:"#f0f4ff" }}>Deal Room AI</p>
                      <span style={{ fontSize:11, color:"#4a6e58", marginLeft:2 }}>full context · {room.property_address.split(",")[0]}</span>
                    </div>
                    <p style={{ fontSize:11, color:"#3a4560", marginTop:6 }}>AI responses are educational estimates — not financial, legal, or mortgage advice.</p>
                  </div>

                  {/* Suggested prompts — only before first message */}
                  {aiMessages.length === 0 && (
                    <div style={{ padding:"16px 18px 0" }}>
                      <p style={{ fontSize:12, color:"#6b7a99", marginBottom:10 }}>Ask anything about this deal</p>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
                        {[
                          pd?.price && pd?.estimatedValue ? "Is this priced fairly?" : "What should we offer?",
                          "What's our negotiating position?",
                          "When should we lock the rate?",
                          pd?.daysOnMarket != null ? `${pd.daysOnMarket} DOM — is that significant?` : "How's the market timing?",
                          scenarios.length > 0 ? "Compare my saved scenarios" : "Model an offer at list price",
                          room.target_close_date ? "Rate lock timeline for close" : "What close date should we target?",
                        ].map((q) => (
                          <button key={q} className="ai-chip" onClick={() => sendAiMessage(q)}>{q}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message thread */}
                  <div className="ai-thread" style={{ padding:"12px 18px" }}>
                    {aiMessages.map((msg, i) => (
                      <div key={i}>
                        {msg.role === "user" ? (
                          <div className="ai-msg-user">{msg.content}</div>
                        ) : (
                          <div className="ai-msg-ai">
                            {msg.content
                              ? msg.content
                              : <span style={{ display:"inline-flex", gap:4 }}>
                                  {[0,1,2].map(j=>(
                                    <span key={j} style={{ width:5,height:5,borderRadius:"50%",background:"#00e87a",display:"inline-block",animation:`ai-pulse 1.2s ease-in-out ${j*0.2}s infinite` }} />
                                  ))}
                                </span>
                            }
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={aiEndRef} />
                  </div>

                  {/* Input */}
                  <div style={{ padding:"10px 18px 14px", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                    <div className="dr-compose" style={{ marginTop:0 }}>
                      <textarea
                        rows={1}
                        placeholder="Ask about this deal…"
                        value={aiInput}
                        onChange={e => setAiInput(e.target.value)}
                        onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(aiInput); } }}
                        onInput={e => { const t=e.target as HTMLTextAreaElement; t.style.height="auto"; t.style.height=t.scrollHeight+"px"; }}
                        disabled={aiStreaming}
                      />
                      <button
                        className="dr-btn"
                        style={{ padding:"8px 16px", flexShrink:0 }}
                        onClick={() => sendAiMessage(aiInput)}
                        disabled={!aiInput.trim() || aiStreaming}
                      >
                        {aiStreaming ? "…" : "Ask"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Messages tab ── */}
              {activeTab === "messages" && (
                <div>
                  <div className="dr-card" style={{ padding:0 }}>
                    <div className="dr-thread">
                      {messages.length === 0 && (
                        <p style={{ color:"#6b7a99", fontSize:13, textAlign:"center", margin:"auto" }}>
                          Start the conversation with your team.
                        </p>
                      )}
                      {messages.map((msg) => {
                        const isSelf = msg.sender_id === userId;
                        const isSys  = msg.sender_role === "system";
                        if (isSys) return <div key={msg.id} className="msg-sys">{msg.content}</div>;
                        const rc = ROLE_COLORS[msg.sender_role] ?? "#6b7a99";
                        return (
                          <div key={msg.id} style={{ display:"flex", flexDirection:"column", alignItems:isSelf?"flex-end":"flex-start" }}>
                            {!isSelf && (
                              <p style={{ fontSize:11, color:rc, marginBottom:3, fontWeight:600 }}>
                                {msg.sender_name ?? ROLE_LABELS[msg.sender_role] ?? msg.sender_role}
                              </p>
                            )}
                            <div className={isSelf ? "msg-self" : "msg-other"}>
                              <p style={{ fontSize:14, lineHeight:1.5 }}>{msg.content}</p>
                            </div>
                            <p style={{ fontSize:11, color:"#3a4560", marginTop:3 }}>{timeAgo(msg.created_at)}</p>
                          </div>
                        );
                      })}
                      <div ref={msgEndRef} />
                    </div>
                  </div>
                  <div className="dr-compose">
                    <textarea
                      rows={1}
                      placeholder="Message the team…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      onInput={(e) => { const t=e.target as HTMLTextAreaElement; t.style.height="auto"; t.style.height=t.scrollHeight+"px"; }}
                    />
                    <button className="dr-btn" style={{ padding:"8px 16px", flexShrink:0 }} onClick={sendMessage} disabled={!draft.trim()||sending}>
                      {sending ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Team tab ── */}
              {activeTab === "team" && (
                <div className="dr-card">
                  {members.map((m) => {
                    const rc = ROLE_COLORS[m.role] ?? "#6b7a99";
                    return (
                      <div key={m.id} className="member-pill">
                        <span style={{ width:8, height:8, borderRadius:"50%", background:m.joined_at?rc:"#3a4560", display:"inline-block", flexShrink:0 }} />
                        <span style={{ flex:1, fontSize:13, color:m.joined_at?"#f0f4ff":"#6b7a99" }}>
                          {m.display_name ?? (m.joined_at ? ROLE_LABELS[m.role] : `${ROLE_LABELS[m.role]} — invite pending`)}
                        </span>
                        <span style={{ fontSize:11, color:rc, fontWeight:600 }}>{ROLE_LABELS[m.role]}</span>
                      </div>
                    );
                  })}

                  <div style={{ marginTop:20, borderTop:"1px solid rgba(255,255,255,0.05)", paddingTop:16 }}>
                    <p style={{ fontSize:12, color:"#6b7a99", marginBottom:14 }}>Invite team members</p>
                    {(["buyer","lo","agent"] as const).map((role) => {
                      const m      = members.find((x) => x.role === role);
                      const link   = inviteLinks[role];
                      const joined = m?.joined_at;
                      const rc     = ROLE_COLORS[role];
                      return (
                        <div key={role} style={{ marginBottom:18, paddingBottom:18, borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                            <span style={{ fontSize:12, fontWeight:600, color:rc }}>{ROLE_LABELS[role]}</span>
                            {joined && <span style={{ fontSize:11, color:"#00e87a" }}>✓ Joined</span>}
                          </div>
                          {!joined && (
                            <>
                              {/* Name + Email inputs */}
                              <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                                <input
                                  type="text"
                                  placeholder="Name (optional)"
                                  value={inviteNames[role] ?? ""}
                                  onChange={e => setInviteNames(prev => ({ ...prev, [role]: e.target.value }))}
                                  style={{ flex:1, background:"#141b28", border:"1px solid rgba(255,255,255,0.08)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"#f0f4ff", outline:"none" }}
                                />
                                <input
                                  type="email"
                                  placeholder="Email to send invite"
                                  value={inviteEmails[role] ?? ""}
                                  onChange={e => setInviteEmails(prev => ({ ...prev, [role]: e.target.value }))}
                                  style={{ flex:1.4, background:"#141b28", border:"1px solid rgba(255,255,255,0.08)", borderRadius:7, padding:"7px 10px", fontSize:12, color:"#f0f4ff", outline:"none" }}
                                />
                              </div>
                              {/* Link row */}
                              <div style={{ display:"flex", gap:8 }}>
                                {link
                                  ? <>
                                      <span className="invite-url">{link}</span>
                                      <button className="dr-ghost" style={{ flexShrink:0, fontSize:12, padding:"6px 12px" }} onClick={() => copyInvite(role)}>
                                        {copiedRole === role ? "Copied!" : "Copy"}
                                      </button>
                                      {inviteEmails[role]?.trim() && (
                                        <button
                                          className="dr-ghost"
                                          style={{ flexShrink:0, fontSize:12, padding:"6px 12px", borderColor:emailSentFor[role]?"rgba(0,232,122,0.4)":"rgba(255,255,255,0.08)", color:emailSentFor[role]?"#00e87a":"#a0aec0" }}
                                          onClick={() => generateInvite(role)}
                                        >
                                          {emailSentFor[role] ? "Sent!" : "Send email"}
                                        </button>
                                      )}
                                    </>
                                  : <button
                                      className="dr-ghost"
                                      style={{ fontSize:12, padding:"7px 14px" }}
                                      onClick={() => generateInvite(role)}
                                    >
                                      {inviteEmails[role]?.trim() ? "Generate & send invite" : "Generate link"}
                                    </button>
                                }
                              </div>
                              {emailSentFor[role] && (
                                <p style={{ fontSize:11, color:"#00e87a", marginTop:5 }}>
                                  Invite email sent to {inviteEmails[role]}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right rail ── */}
            <div>
              {/* Offer Confidence Score summary */}
              {scoreData && (
                <div
                  className="rail-card"
                  style={{ borderColor: scoreData.score >= 75 ? "rgba(0,232,122,0.2)" : scoreData.score >= 50 ? "rgba(251,191,36,0.2)" : "rgba(248,113,113,0.2)", cursor:"pointer" }}
                  onClick={() => setActiveTab("property")}
                >
                  <span className="rail-label">Offer Score</span>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <p style={{
                      fontSize:28, fontFamily:"'Syne',sans-serif", fontWeight:700, lineHeight:1,
                      color: scoreData.score >= 75 ? "#00e87a" : scoreData.score >= 50 ? "#fbbf24" : "#f87171",
                    }}>{scoreData.score}</p>
                    <p style={{ fontSize:11, color:"#6b7a99", lineHeight:1.4 }}>out of<br/>100</p>
                  </div>
                  <p style={{ fontSize:11, color:"#4a6e58", marginTop:4 }}>
                    {scoreData.score >= 75 ? "Strong position" : scoreData.score >= 50 ? "Moderate" : "Needs attention"}
                  </p>
                </div>
              )}

              {/* PITI at a glance — mirrors active modeler */}
              {modPiti && (
                <div className="rail-card" style={{ borderColor:"rgba(0,232,122,0.15)" }}>
                  <span className="rail-label">Est. PITI / mo</span>
                  <p style={{ fontSize:22, fontFamily:"'Syne',sans-serif", fontWeight:700, color:"#00e87a", lineHeight:1, marginBottom:4 }}>
                    ${modPiti.total.toLocaleString()}
                  </p>
                  <p style={{ fontSize:11, color:"#4a6e58" }}>
                    {scenDown}% dn · {scenTerm}Y · {scenRate}%
                  </p>
                </div>
              )}

              {/* Team status */}
              <div className="rail-card">
                <span className="rail-label">Team</span>
                {(["buyer","lo","agent"] as const).map((role) => {
                  const m  = members.find((x) => x.role === role);
                  const rc = ROLE_COLORS[role];
                  return (
                    <div key={role} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:m?.joined_at?rc:"#3a4560", display:"inline-block", flexShrink:0 }} />
                      <span style={{ fontSize:13, color:m?.joined_at?"#f0f4ff":"#6b7a99", flex:1 }}>{ROLE_LABELS[role]}</span>
                    </div>
                  );
                })}
                {isCreator && (
                  <button
                    className="dr-ghost"
                    style={{ marginTop:8, width:"100%", fontSize:12, padding:"7px 0" }}
                    onClick={() => { setActiveTab("team"); loadInvites(); }}
                  >
                    + Invite members
                  </button>
                )}
              </div>

              {/* Deal stage */}
              <div className="rail-card">
                <span className="rail-label">Stage</span>
                {STATUSES.map((s, i) => {
                  const cur    = STATUSES.indexOf(room.status as any);
                  const done   = i < cur;
                  const active = i === cur;
                  return (
                    <div key={s} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", flexShrink:0, display:"inline-block", background: done?"#00e87a" : active? STATUS_COLOR[s] : "#3a4560" }} />
                      <span style={{ fontSize:12, color: active?"#f0f4ff" : done?"#6b7a99" : "#3a4560", fontWeight:active?600:400 }}>
                        {STATUS_LABELS[s]}
                      </span>
                    </div>
                  );
                })}
                {isCreator && room.status !== "closed" && (
                  <button className="dr-ghost" style={{ marginTop:10, width:"100%", fontSize:12, padding:"7px 0" }} onClick={advanceStatus} disabled={updatingStatus}>
                    Advance stage →
                  </button>
                )}
              </div>

              {/* Offer */}
              {room.offer_price && (
                <div className="rail-card">
                  <span className="rail-label">Offer Price</span>
                  <p style={{ fontSize:22, fontFamily:"'Syne',sans-serif", fontWeight:700, color:"#00e87a" }}>{fmt(room.offer_price)}</p>
                </div>
              )}

              {/* Scenarios count */}
              {scenarios.length > 0 && (
                <div
                  className="rail-card"
                  style={{ cursor:"pointer" }}
                  onClick={() => setActiveTab("financing")}
                >
                  <span className="rail-label">Scenarios</span>
                  <p style={{ fontSize:15, fontWeight:600, color:"#f0f4ff" }}>{scenarios.length} saved</p>
                  <p style={{ fontSize:11, color:"#6b7a99", marginTop:2 }}>
                    Best: ${Math.min(...scenarios.filter(s=>s.piti).map(s=>s.piti!)).toLocaleString()}/mo
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="dr-footer">
          HomeRates.ai is a technology platform, not a mortgage lender, broker, or financial advisor. Payment scenarios are illustrations for planning purposes and do not constitute a Loan Estimate under RESPA/TRID. Actual rates, costs, and loan terms are subject to credit qualification and may differ.
          {loNmls && <> · {loDisplayName ?? "Loan Officer"} NMLS #{loNmls}.</>}
        </footer>
      </div>
    </>
  );
}

// ── Offer Score Card ─────────────────────────────────────────────────────────

type ScoreSignal = { key:string; label:string; detail:string; points:number; max:number; status:'good'|'ok'|'warn' };

function OfferScoreCard({
  scoreData, loading, onLoad, roomId,
}: {
  scoreData: { score:number; signals:ScoreSignal[]; narrative:string; rate:number|null } | null;
  loading: boolean;
  onLoad: () => void;
  roomId: string;
}) {
  const statusColor = (s: ScoreSignal['status']) =>
    s === 'good' ? '#00e87a' : s === 'ok' ? '#fbbf24' : '#f87171';
  const statusIcon  = (s: ScoreSignal['status']) =>
    s === 'good' ? '✓' : s === 'ok' ? '●' : '⚠';

  const ringColor = scoreData
    ? scoreData.score >= 75 ? '#00e87a' : scoreData.score >= 50 ? '#fbbf24' : '#f87171'
    : '#3a4560';

  return (
    <div className="score-card">
      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <p style={{ fontSize:13, fontWeight:600, color:"#f0f4ff" }}>Offer Confidence Score</p>
        <button
          onClick={onLoad}
          disabled={loading}
          style={{ background:"none", border:"none", color:"#6b7a99", fontSize:12, cursor:"pointer", fontFamily:"inherit", padding:0 }}
        >
          {loading ? "Analyzing…" : scoreData ? "↻ Refresh" : "Run analysis"}
        </button>
      </div>

      {/* Loading state */}
      {loading && !scoreData && (
        <div style={{ padding:"24px 0", textAlign:"center" }}>
          <p style={{ fontSize:13, color:"#6b7a99" }}>Running AI analysis…</p>
          <div style={{ width:"100%", height:3, background:"rgba(255,255,255,0.04)", borderRadius:99, marginTop:12, overflow:"hidden" }}>
            <div style={{ width:"60%", height:"100%", background:"linear-gradient(90deg,transparent,#00e87a,transparent)", animation:"score-scan 1.4s ease-in-out infinite" }} />
          </div>
          <style>{`@keyframes score-scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }`}</style>
        </div>
      )}

      {/* Empty state */}
      {!loading && !scoreData && (
        <div style={{ padding:"20px 0", textAlign:"center" }}>
          <p style={{ fontSize:22, marginBottom:8 }}>🏠</p>
          <p style={{ fontSize:13, color:"#6b7a99", marginBottom:14, lineHeight:1.5 }}>
            Get an AI-powered confidence score for this deal — price position, market timing, financing readiness, and more.
          </p>
          <button
            onClick={onLoad}
            style={{ background:"#00e87a", color:"#080c12", border:"none", borderRadius:8, padding:"9px 20px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}
          >
            Analyze this deal
          </button>
        </div>
      )}

      {/* Score display */}
      {scoreData && (
        <>
          {/* Score ring + bar */}
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
            <div className="score-ring" style={{ color:ringColor, borderColor:ringColor }}>
              {scoreData.score}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:15, fontWeight:600, color:ringColor, fontFamily:"'Syne',sans-serif" }}>
                  {scoreData.score >= 75 ? "Strong Position" : scoreData.score >= 50 ? "Moderate" : scoreData.score >= 25 ? "Caution" : "Weak Position"}
                </span>
                <span style={{ fontSize:12, color:"#6b7a99" }}>{scoreData.score}/100</span>
              </div>
              <div className="score-bar-track">
                <div className="score-bar-fill" style={{ width:`${scoreData.score}%`, background:ringColor }} />
              </div>
            </div>
          </div>

          {/* Signal breakdown */}
          <div style={{ marginBottom:4 }}>
            {scoreData.signals.map((sig) => (
              <div key={sig.key} className="score-signal">
                <span style={{ fontSize:12, color:statusColor(sig.status), width:14, flexShrink:0, textAlign:"center" }}>
                  {statusIcon(sig.status)}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                    <span style={{ fontSize:12, fontWeight:500, color:"#f0f4ff" }}>{sig.label}</span>
                    <span style={{ fontSize:11, color:"#6b7a99", flexShrink:0, marginLeft:8 }}>{sig.points}/{sig.max}</span>
                  </div>
                  <p style={{ fontSize:11, color:"#6b7a99", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {sig.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* AI narrative */}
          <p className="score-narrative">{scoreData.narrative}</p>
        </>
      )}
    </div>
  );
}

function SnapStat({ label, value, accent }: { label:string; value:string; accent?:boolean }) {
  return (
    <div>
      <p style={{ fontSize:10, color:"#3a4560", textTransform:"uppercase", letterSpacing:".06em", marginBottom:2 }}>{label}</p>
      <p style={{ fontSize:14, fontWeight:600, color:accent?"#00e87a":"#f0f4ff" }}>{value}</p>
    </div>
  );
}

function PdCell({ label, value }: { label:string; value:string }) {
  return (
    <div className="pd-item">
      <p className="pd-label">{label}</p>
      <p className="pd-value">{value}</p>
    </div>
  );
}
