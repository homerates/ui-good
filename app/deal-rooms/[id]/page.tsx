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

function calcPITI(
  price: number, downPct: number, ratePct: number, termYears: number,
  annualTaxes: number, hoaMonthly: number
): { pi:number; taxes:number; ins:number; pmi:number; hoa:number; total:number; loan:number } | null {
  if (!(price > 0) || !(ratePct > 0) || !(termYears > 0)) return null;
  const loan = price * (1 - downPct / 100);
  const r = (ratePct / 100) / 12;
  const n = termYears * 12;
  const pi = loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  const taxes = annualTaxes / 12;
  const ins   = (price * 0.003) / 12;
  const pmi   = downPct < 20 ? (loan * 0.005) / 12 : 0;
  const hoa   = hoaMonthly;
  return {
    pi:    Math.round(pi),
    taxes: Math.round(taxes),
    ins:   Math.round(ins),
    pmi:   Math.round(pmi),
    hoa:   Math.round(hoa),
    total: Math.round(pi + taxes + ins + pmi + hoa),
    loan:  Math.round(loan),
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
  const [liveRate,  setLiveRate]  = React.useState<number | null>(null);
  const [activeTab, setActiveTab] = React.useState<"property"|"financing"|"messages"|"team">("property");

  // Messages
  const [draft,   setDraft]   = React.useState("");
  const [sending, setSending] = React.useState(false);
  const msgEndRef = React.useRef<HTMLDivElement>(null);

  // Invite
  const [inviteLinks,  setInviteLinks]  = React.useState<Record<string,string>>({});
  const [copiedRole,   setCopiedRole]   = React.useState<string|null>(null);
  const [inviteLoaded, setInviteLoaded] = React.useState(false);

  // Status
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  // Financing / scenario modeler
  const [scenPrice,  setScenPrice]  = React.useState("");
  const [scenDown,   setScenDown]   = React.useState("10");
  const [scenTerm,   setScenTerm]   = React.useState("30");
  const [scenRate,   setScenRate]   = React.useState("");
  const [scenLabel,  setScenLabel]  = React.useState("");
  const [savingScen, setSavingScen] = React.useState(false);

  // Seed scenario modeler defaults when room + rate load
  React.useEffect(() => {
    if (room && !scenPrice) {
      const price = room.offer_price ?? room.property_data?.price;
      if (price) setScenPrice(String(Math.round(price)));
    }
  }, [room]);
  React.useEffect(() => {
    if (liveRate && !scenRate) setScenRate(liveRate.toFixed(2));
  }, [liveRate]);

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
    if (fredRes.ok && fredRes.mort30Avg) setLiveRate(fredRes.mort30Avg);
    setLoading(false);
  }

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.replace("/sign-in"); return; }
    if (roomId) load();
  }, [isLoaded, isSignedIn, roomId]);

  React.useEffect(() => {
    if (activeTab === "messages") msgEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, activeTab]);

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
    await fetch(`/api/deal-rooms/${roomId}/invite`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ role }),
    });
    setInviteLoaded(false);
    loadInvites();
  }

  function copyInvite(role: string) {
    const link = inviteLinks[role];
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedRole(role);
    setTimeout(() => setCopiedRole(null), 2000);
  }

  async function saveScenario() {
    if (savingScen) return;
    const price = parseFloat(scenPrice.replace(/,/g, ""));
    const down  = parseFloat(scenDown);
    const rate  = parseFloat(scenRate);
    const term  = parseInt(scenTerm);
    if (isNaN(price) || isNaN(down) || isNaN(rate) || isNaN(term)) return;
    const pd      = room?.property_data;
    const taxes   = pd?.annualTaxes ?? price * 0.012;
    const hoa     = pd?.hoaMonthly  ?? 0;
    const pitiRes = calcPITI(price, down, rate, term, taxes, hoa);
    if (!pitiRes) return;
    setSavingScen(true);
    const autoLabel = scenLabel.trim() || `Offer at ${fmt(price)}, ${down}% dn`;
    const res = await fetch(`/api/deal-rooms/${roomId}/scenarios`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: autoLabel, offer_price: price, down_pct: down,
        loan_type: "conventional", rate, piti: pitiRes.total,
        result_json: pitiRes,
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
  const unread    = messages.filter(m => m.sender_role !== "system").length;

  // Hero PITI (list price or offer price, 10% dn, live rate, 30Y)
  const heroPrice = room.offer_price ?? pd?.price ?? null;
  const heroTaxes = pd?.annualTaxes ?? (heroPrice ? heroPrice * 0.012 : 0);
  const heroHoa   = pd?.hoaMonthly ?? 0;
  const heroPiti  = liveRate && heroPrice ? calcPITI(heroPrice, 10, liveRate, 30, heroTaxes, heroHoa) : null;

  // Modeler live preview
  const modNum    = parseFloat(scenPrice.replace(/,/g, ""));
  const modDown   = parseFloat(scenDown);
  const modRate   = parseFloat(scenRate);
  const modTerm   = parseInt(scenTerm);
  const modTaxes  = pd?.annualTaxes ?? (!isNaN(modNum) ? modNum * 0.012 : 0);
  const modHoa    = pd?.hoaMonthly  ?? 0;
  const modPiti   = !isNaN(modNum) && !isNaN(modDown) && !isNaN(modRate) && !isNaN(modTerm)
    ? calcPITI(modNum, modDown, modRate, modTerm, modTaxes, modHoa) : null;

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
          border-radius:10px; padding:14px 16px;
          display:flex; align-items:center; justify-content:space-between; gap:12px;
        }

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
                <button className={`dr-tab${activeTab==="messages"?" active":""}`} onClick={() => setActiveTab("messages")}>
                  Messages{unread > 0 ? ` · ${unread}` : ""}
                </button>
                <button
                  className={`dr-tab${activeTab==="team"?" active":""}`}
                  onClick={() => { setActiveTab("team"); loadInvites(); }}
                >
                  Team · {members.filter(m=>m.joined_at).length}/{members.length}
                </button>
              </div>

              {/* ── Property tab ── */}
              {activeTab === "property" && (
                <div>
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
                  {/* Live rate strip */}
                  <div className="fin-rate-strip">
                    <span style={{ fontSize:16 }}>📈</span>
                    {liveRate
                      ? <><strong>{liveRate.toFixed(2)}%</strong>&nbsp;30Y Fixed&nbsp;<span style={{ color:"#4a6e58", fontSize:12 }}>· FRED live rate</span></>
                      : <span style={{ color:"#6b7a99" }}>Loading live rate…</span>
                    }
                  </div>

                  {/* PITI hero */}
                  {heroPiti ? (
                    <div className="fin-hero">
                      <p style={{ fontSize:11, color:"#6b7a99", textTransform:"uppercase", letterSpacing:".06em", marginBottom:8 }}>
                        Est. PITI — {room.offer_price ? "at offer price" : "at list price"} · 10% down · 30Y
                      </p>
                      <p style={{ fontSize:36, fontFamily:"'Syne',sans-serif", fontWeight:700, color:"#00e87a", lineHeight:1 }}>
                        {fmtMo(heroPiti.total)}
                      </p>
                      <div className="fin-breakdown">
                        <div className="fin-cell">
                          <p className="fin-cell-label">P&amp;I</p>
                          <p className="fin-cell-value">${heroPiti.pi.toLocaleString()}</p>
                        </div>
                        <div className="fin-cell">
                          <p className="fin-cell-label">Property Tax</p>
                          <p className="fin-cell-value">${heroPiti.taxes.toLocaleString()}</p>
                        </div>
                        <div className="fin-cell">
                          <p className="fin-cell-label">Insurance</p>
                          <p className="fin-cell-value">${heroPiti.ins.toLocaleString()}</p>
                        </div>
                        {heroPiti.pmi > 0 && (
                          <div className="fin-cell">
                            <p className="fin-cell-label">PMI</p>
                            <p className="fin-cell-value">${heroPiti.pmi.toLocaleString()}</p>
                          </div>
                        )}
                        {heroPiti.hoa > 0 && (
                          <div className="fin-cell">
                            <p className="fin-cell-label">HOA</p>
                            <p className="fin-cell-value">${heroPiti.hoa.toLocaleString()}</p>
                          </div>
                        )}
                        <div className="fin-cell" style={{ background:"rgba(0,232,122,0.08)", border:"1px solid rgba(0,232,122,0.15)" }}>
                          <p className="fin-cell-label" style={{ color:"#00e87a" }}>Total PITI</p>
                          <p className="fin-cell-value" style={{ color:"#00e87a" }}>${heroPiti.total.toLocaleString()}</p>
                        </div>
                      </div>
                      <p style={{ fontSize:11, color:"#3a4560", marginTop:12 }}>
                        Loan amount: {fmt(heroPiti.loan)} · {heroPiti.taxes > 0 ? "taxes from property record" : "taxes estimated at 1.2%"} · insurance at 0.3%{heroPiti.pmi > 0 ? " · PMI included (<20% down)" : ""}
                      </p>
                    </div>
                  ) : !liveRate ? (
                    <div className="dr-card" style={{ marginBottom:14 }}>
                      <p style={{ fontSize:13, color:"#6b7a99", textAlign:"center", padding:"20px 0" }}>Fetching live rate…</p>
                    </div>
                  ) : (
                    <div className="dr-card" style={{ marginBottom:14 }}>
                      <p style={{ fontSize:13, color:"#6b7a99", textAlign:"center", padding:"20px 0" }}>Add property data to see PITI breakdown.</p>
                    </div>
                  )}

                  {/* Scenario modeler */}
                  <div className="dr-card">
                    <p style={{ fontSize:13, fontWeight:600, color:"#f0f4ff", marginBottom:14 }}>Model a Scenario</p>
                    <div className="mod-row">
                      <div>
                        <span className="dr-lbl">Offer Price ($)</span>
                        <input
                          className="dr-input"
                          placeholder={pd?.price ? String(Math.round(pd.price)) : "750000"}
                          value={scenPrice}
                          onChange={e => setScenPrice(e.target.value)}
                        />
                      </div>
                      <div>
                        <span className="dr-lbl">Down Payment (%)</span>
                        <input className="dr-input" type="number" min="0" max="100" step="0.5" value={scenDown} onChange={e => setScenDown(e.target.value)} />
                      </div>
                    </div>
                    <div className="mod-row">
                      <div>
                        <span className="dr-lbl">Rate (%)</span>
                        <input
                          className="dr-input"
                          type="number"
                          step="0.01"
                          placeholder={liveRate ? liveRate.toFixed(2) : "6.75"}
                          value={scenRate}
                          onChange={e => setScenRate(e.target.value)}
                        />
                      </div>
                      <div>
                        <span className="dr-lbl">Term</span>
                        <select className="dr-select" value={scenTerm} onChange={e => setScenTerm(e.target.value)}>
                          <option value="30">30 Year</option>
                          <option value="15">15 Year</option>
                          <option value="20">20 Year</option>
                          <option value="10">10 Year</option>
                        </select>
                      </div>
                    </div>

                    {/* Live preview */}
                    {modPiti && (
                      <div style={{ background:"rgba(0,232,122,0.05)", border:"1px solid rgba(0,232,122,0.12)", borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
                        <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
                          <span style={{ fontSize:24, fontFamily:"'Syne',sans-serif", fontWeight:700, color:"#00e87a" }}>${modPiti.total.toLocaleString()}/mo</span>
                          <span style={{ fontSize:12, color:"#4a6e58" }}>total PITI</span>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 16px" }}>
                          <span style={{ fontSize:12, color:"#6b7a99" }}>P&I ${modPiti.pi.toLocaleString()}</span>
                          <span style={{ fontSize:12, color:"#6b7a99" }}>Tax ${modPiti.taxes.toLocaleString()}</span>
                          <span style={{ fontSize:12, color:"#6b7a99" }}>Ins ${modPiti.ins.toLocaleString()}</span>
                          {modPiti.pmi > 0 && <span style={{ fontSize:12, color:"#fbbf24" }}>PMI ${modPiti.pmi.toLocaleString()}</span>}
                          {modPiti.hoa > 0 && <span style={{ fontSize:12, color:"#6b7a99" }}>HOA ${modPiti.hoa.toLocaleString()}</span>}
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom:12 }}>
                      <span className="dr-lbl">Scenario Name (optional)</span>
                      <input
                        className="dr-input"
                        placeholder={modPiti && !isNaN(modNum) ? `Offer at ${fmt(modNum)}, ${scenDown}% dn` : "e.g. Aggressive offer, Counter offer…"}
                        value={scenLabel}
                        onChange={e => setScenLabel(e.target.value)}
                      />
                    </div>

                    <button
                      className="dr-btn"
                      style={{ width:"100%" }}
                      onClick={saveScenario}
                      disabled={savingScen || !modPiti}
                    >
                      {savingScen ? "Saving…" : "Save Scenario — share with team"}
                    </button>
                  </div>

                  {/* Saved scenarios */}
                  {scenarios.length > 0 && (
                    <div style={{ marginTop:14 }}>
                      <p style={{ fontSize:11, color:"#3a4560", textTransform:"uppercase", letterSpacing:".08em", marginBottom:10 }}>Saved Scenarios</p>
                      <div className="scen-list">
                        {scenarios.map((s) => {
                          const rc = ROLE_COLORS[s.created_by_role] ?? "#6b7a99";
                          return (
                            <div key={s.id} className="scen-card">
                              <div style={{ flex:1, minWidth:0 }}>
                                <p style={{ fontSize:13, fontWeight:500, color:"#f0f4ff", marginBottom:3 }}>
                                  {s.label ?? (s.offer_price ? `Offer at ${fmt(s.offer_price)}` : "Scenario")}
                                </p>
                                <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 12px" }}>
                                  {s.offer_price && <span style={{ fontSize:12, color:"#6b7a99" }}>{fmt(s.offer_price)}</span>}
                                  {s.down_pct    && <span style={{ fontSize:12, color:"#6b7a99" }}>{s.down_pct}% dn</span>}
                                  {s.rate        && <span style={{ fontSize:12, color:"#6b7a99" }}>{s.rate}%</span>}
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
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                    <p style={{ fontSize:12, color:"#6b7a99", marginBottom:14 }}>Invite links</p>
                    {(["buyer","lo","agent"] as const).map((role) => {
                      const m      = members.find((x) => x.role === role);
                      const link   = inviteLinks[role];
                      const joined = m?.joined_at;
                      const rc     = ROLE_COLORS[role];
                      return (
                        <div key={role} style={{ marginBottom:12 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                            <span style={{ fontSize:12, fontWeight:600, color:rc }}>{ROLE_LABELS[role]}</span>
                            {joined && <span style={{ fontSize:11, color:"#00e87a" }}>✓ Joined</span>}
                          </div>
                          {!joined && (
                            <div style={{ display:"flex", gap:8 }}>
                              {link
                                ? <>
                                    <span className="invite-url">{link}</span>
                                    <button className="dr-ghost" style={{ flexShrink:0, fontSize:12, padding:"6px 12px" }} onClick={() => copyInvite(role)}>
                                      {copiedRole === role ? "Copied!" : "Copy"}
                                    </button>
                                  </>
                                : <button className="dr-ghost" style={{ fontSize:12, padding:"7px 14px" }} onClick={() => generateInvite(role)}>
                                    Generate link
                                  </button>
                              }
                            </div>
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
              {/* PITI at a glance */}
              {heroPiti && (
                <div className="rail-card" style={{ borderColor:"rgba(0,232,122,0.15)" }}>
                  <span className="rail-label">Est. PITI / mo</span>
                  <p style={{ fontSize:22, fontFamily:"'Syne',sans-serif", fontWeight:700, color:"#00e87a", lineHeight:1, marginBottom:4 }}>
                    ${heroPiti.total.toLocaleString()}
                  </p>
                  <p style={{ fontSize:11, color:"#4a6e58" }}>
                    10% dn · 30Y · {liveRate?.toFixed(2)}%
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
          HomeRates.ai is an independent educational tool and is not a mortgage lender or broker.
        </footer>
      </div>
    </>
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
