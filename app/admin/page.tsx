"use client";
// app/admin/page.tsx
// Admin dashboard — stats overview, recent claims, activity log, manage admins

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppNav from "../components/AppNav";
import { useAdminStatus } from "../hooks/useAdminStatus";

const PRO_TYPE_LABEL: Record<string, string> = {
  lo:            "Loan Officer",
  lo_company:    "Mortgage Company",
  agent:         "Real Estate Agent",
  agent_broker:  "RE Broker / Corp",
};

function f$(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

type AdminUser = { clerk_user_id: string; email?: string; display_name?: string; added_at?: string };
type PlatformUser = { id: string; email: string; full_name: string | null; role: string; referral_code: string | null; created_at: string };
type FoundingStats = { claimed: number; remaining: number; sent?: number; failed?: number };

export default function AdminDashboard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Platform users management
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [userMsg, setUserMsg] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState<Record<string, string>>({});
  const [grantNote, setGrantNote] = useState<Record<string, string>>({});
  const [granting, setGranting] = useState<string | null>(null);

  // Founding 500 state
  const [foundingStats, setFoundingStats] = useState<FoundingStats | null>(null);
  const [blasting, setBlasting] = useState(false);
  const [blastResult, setBlastResult] = useState<string | null>(null);

  // Consumer invite state
  const [ciEmail, setCiEmail] = useState("");
  const [ciName, setCiName] = useState("");
  const [ciPhone, setCiPhone] = useState("");
  const [ciCredits, setCiCredits] = useState("25");
  const [ciNote, setCiNote] = useState("");
  const [ciSending, setCiSending] = useState(false);
  const [ciResult, setCiResult] = useState<{ ok: boolean; msg: string; url?: string } | null>(null);

  async function sendConsumerInvite() {
    const email = ciEmail.trim().toLowerCase();
    const fullName = ciName.trim();
    const credits = parseInt(ciCredits, 10);
    if (!email || !fullName || !credits) return;
    setCiSending(true);
    setCiResult(null);
    try {
      const res = await fetch("/api/admin/consumer-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, phone: ciPhone.trim() || undefined, credits, personalNote: ciNote.trim() || undefined }),
      });
      const d = await res.json();
      if (res.ok) {
        setCiResult({ ok: true, msg: `Invite sent to ${email}`, url: d.inviteUrl });
        setCiEmail(""); setCiName(""); setCiPhone(""); setCiNote(""); setCiCredits("25");
      } else {
        setCiResult({ ok: false, msg: d.error ?? "Failed to send invite" });
      }
    } catch {
      setCiResult({ ok: false, msg: "Network error" });
    } finally {
      setCiSending(false);
    }
  }

  // Scenario management state
  const [adminScenarios, setAdminScenarios] = useState<any[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [scenarioMsg, setScenarioMsg] = useState<{ id: string; msg: string } | null>(null);

  async function fetchAdminScenarios() {
    setScenariosLoading(true);
    fetch("/api/admin/scenarios")
      .then(r => r.json())
      .then(d => setAdminScenarios(d.scenarios ?? []))
      .finally(() => setScenariosLoading(false));
  }

  async function adminScenarioAction(id: string, action: "archive" | "delete") {
    if (action === "delete" && !confirm("Delete this scenario and all its responses? This cannot be undone.")) return;
    const res = action === "delete"
      ? await fetch("/api/admin/scenarios", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      : await fetch("/api/admin/scenarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "archived" }) });
    const d = await res.json();
    if (res.ok) {
      setAdminScenarios(prev => action === "delete" ? prev.filter(s => s.id !== id) : prev.map(s => s.id === id ? { ...s, status: "archived" } : s));
      setScenarioMsg({ id, msg: action === "delete" ? "Deleted" : "Archived ✓" });
      setTimeout(() => setScenarioMsg(null), 3000);
    } else {
      setScenarioMsg({ id, msg: d.error ?? "Failed" });
    }
  }

  // LO Networks state
  type LORow = { id: string; user_id: string; name: string; email: string; lender: string; borrower_count: number };
  type BorrowerRow = { id: string; name: string; email: string | null; property_address: string | null; digest_enabled: boolean; actual_balance: number | null; actual_rate: number | null };
  const [los, setLos] = useState<LORow[]>([]);
  const [losLoading, setLosLoading] = useState(false);
  const [expandedLo, setExpandedLo] = useState<string | null>(null);
  const [loBorrowers, setLoBorrowers] = useState<Record<string, BorrowerRow[]>>({});
  const [borrowersLoading, setBorrowersLoading] = useState<string | null>(null);
  const [digestSending, setDigestSending] = useState<string | null>(null);
  const [digestMsg, setDigestMsg] = useState<Record<string, string>>({});

  // Admin users state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [newAdminId, setNewAdminId] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState(false);

  function fetchLos() {
    setLosLoading(true);
    fetch("/api/admin/lo-borrowers")
      .then(r => r.json())
      .then(d => setLos(d.los ?? []))
      .finally(() => setLosLoading(false));
  }

  async function fetchLoBorrowers(loId: string) {
    setBorrowersLoading(loId);
    const r = await fetch(`/api/admin/lo-borrowers?lo_id=${loId}`);
    const d = await r.json();
    setLoBorrowers(prev => ({ ...prev, [loId]: d.borrowers ?? [] }));
    setBorrowersLoading(null);
  }

  function toggleLo(loId: string) {
    if (expandedLo === loId) { setExpandedLo(null); return; }
    setExpandedLo(loId);
    if (!loBorrowers[loId]) fetchLoBorrowers(loId);
  }

  async function adminSendDigest(borrowerId: string, loId: string, preview: boolean) {
    const key = borrowerId + (preview ? "_preview" : "_digest");
    setDigestSending(key);
    const r = await fetch("/api/digest/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borrower_id: borrowerId, send_to_lo: preview, admin_override: true }),
    });
    const d = await r.json();
    setDigestSending(null);
    setDigestMsg(prev => ({ ...prev, [key]: r.ok ? "Sent ✓" : (d.error ?? "Failed") }));
    setTimeout(() => setDigestMsg(prev => { const n = { ...prev }; delete n[key]; return n; }), 4000);
  }

  useEffect(() => {
    if (!isLoaded || adminLoading) return;
    if (!isAdmin) { router.replace("/"); return; }
    fetchLos();
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(d => setStats(d))
      .finally(() => setLoading(false));
    fetch("/api/admin/founding-stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setFoundingStats(d));
    fetchAdmins();
    fetchUsers(0, "");
    fetchAdminScenarios();
  }, [isLoaded, adminLoading, isAdmin]);

  function fetchUsers(page: number, q: string) {
    setUsersLoading(true);
    fetch(`/api/admin/users-list?page=${page}&q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => { setUsers(d.users ?? []); setUsersTotal(d.total ?? 0); setUsersPage(page); })
      .finally(() => setUsersLoading(false));
  }

  async function grantCredits(userId: string) {
    const amount = parseInt(grantAmount[userId] ?? "0", 10);
    if (!amount || amount < 1) return;
    setGranting(userId);
    setUserMsg(null);
    const res = await fetch("/api/admin/grant-credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, amount, note: grantNote[userId] ?? "" }),
    });
    const d = await res.json();
    setGranting(null);
    if (!res.ok) {
      setUserMsg({ id: userId, msg: d.error ?? "Failed", ok: false });
    } else {
      setUserMsg({ id: userId, msg: `Granted ${amount} credits ✓ (balance: ${d.newBalance})`, ok: true });
      setGrantAmount(prev => ({ ...prev, [userId]: "" }));
      setGrantNote(prev => ({ ...prev, [userId]: "" }));
      setGrantOpen(null);
      setTimeout(() => setUserMsg(null), 5000);
    }
  }

  async function updateUser(userId: string, payload: { role?: string; action?: string }) {
    setUpdatingUser(userId);
    setUserMsg(null);
    const res = await fetch("/api/admin/users-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...payload }),
    });
    const d = await res.json();
    setUpdatingUser(null);
    if (!res.ok) {
      setUserMsg({ id: userId, msg: d.error ?? "Failed", ok: false });
    } else {
      setUserMsg({ id: userId, msg: payload.action === "generate_code" ? `Code: ${d.user.referral_code}` : "Saved ✓", ok: true });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...d.user } : u));
      setTimeout(() => setUserMsg(null), 4000);
    }
  }

  function fetchAdmins() {
    setAdminsLoading(true);
    fetch("/api/admin/users")
      .then(r => r.json())
      .then(d => setAdmins(d.admins ?? []))
      .finally(() => setAdminsLoading(false));
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAddError(""); setAddSuccess(false);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerk_user_id: newAdminId.trim(), email: newAdminEmail.trim() || undefined, display_name: newAdminName.trim() || undefined }),
    });
    const d = await res.json();
    if (!res.ok) { setAddError(d.error ?? "Failed"); return; }
    setAddSuccess(true);
    setNewAdminId(""); setNewAdminEmail(""); setNewAdminName("");
    fetchAdmins();
    setTimeout(() => setAddSuccess(false), 3000);
  }

  async function handleRemoveAdmin(clerkId: string) {
    if (!confirm(`Remove ${clerkId} from admins?`)) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerk_user_id: clerkId }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error ?? "Failed to remove"); return; }
    fetchAdmins();
  }

  async function handleFoundingBlast() {
    if (!confirm(`Send urgency email to ALL founding members? This cannot be undone.`)) return;
    setBlasting(true);
    setBlastResult(null);
    const res = await fetch("/api/admin/founding-blast", { method: "POST" });
    const d = await res.json();
    setBlasting(false);
    if (!res.ok) {
      setBlastResult(`Error: ${d.error ?? "Failed"}`);
    } else {
      setBlastResult(`Sent to ${d.sent} founding members (${d.failed} failed). ${d.remaining} spots remaining.`);
    }
  }

  if (!isLoaded || adminLoading) return null;
  if (isLoaded && !adminLoading && !isAdmin) return null;

  const claimRate = stats?.totals?.all
    ? ((stats.totals.claimed / stats.totals.all) * 100).toFixed(1)
    : "0";

  return (
    <>
      <style>{`
        body:has(.adm-root){display:block!important;height:auto!important;overflow-y:auto!important;background:#080c12!important}
        html:has(.adm-root){height:auto!important;overflow:visible!important;background:#080c12!important}
        .adm-root{min-height:100vh;background:#080c12;color:#f0f4ff;font-family:'DM Sans',system-ui,sans-serif}
        .adm-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;height:56px;background:rgba(8,12,18,0.96);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(8px)}
        .adm-logo img{height:26px;display:block}
        .adm-nav-links{display:flex;gap:1.5rem;align-items:center}
        .adm-nav-link{font-size:0.84rem;color:rgba(255,255,255,0.5);text-decoration:none;transition:color 0.2s}
        .adm-nav-link:hover,.adm-nav-link.active{color:#f0f4ff}
        .adm-nav-badge{font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(255,95,95,0.15);color:#ff5f5f;border:1px solid rgba(255,95,95,0.25)}

        .adm-shell{max-width:1200px;margin:0 auto;padding:2.5rem 1.5rem 5rem}
        .adm-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#ff5f5f;margin-bottom:0.4rem}
        .adm-h1{font-size:1.8rem;font-weight:800;letter-spacing:-0.03em;margin:0 0 2rem}

        .adm-stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;margin-bottom:2.5rem}
        .adm-stat{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:1.25rem 1.5rem}
        .adm-stat-val{font-size:2rem;font-weight:800;letter-spacing:-0.03em;color:#f0f4ff;line-height:1}
        .adm-stat-label{font-size:0.72rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-top:6px}
        .adm-stat.green .adm-stat-val{color:#00e87a}
        .adm-stat.amber .adm-stat-val{color:#ff8c42}
        .adm-stat.red   .adm-stat-val{color:#ff5f5f}

        .adm-section{margin-bottom:2.5rem}
        .adm-section-title{font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(255,255,255,0.06)}

        .adm-two-col{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}

        .adm-table{width:100%;border-collapse:collapse;font-size:0.82rem}
        .adm-table th{text-align:left;padding:8px 10px;font-size:0.7rem;font-weight:600;color:rgba(255,255,255,0.3);letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.07)}
        .adm-table td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);vertical-align:middle}
        .adm-table tr:last-child td{border-bottom:none}
        .adm-table tr:hover td{background:rgba(255,255,255,0.02)}

        .adm-badge{font-size:0.67rem;font-weight:700;padding:2px 7px;border-radius:99px;border:1px solid transparent;white-space:nowrap}
        .adm-badge.claimed{background:rgba(0,232,122,0.1);color:#00e87a;border-color:rgba(0,232,122,0.25)}
        .adm-badge.self{background:rgba(61,139,255,0.1);color:#3d8bff;border-color:rgba(61,139,255,0.25)}
        .adm-badge.dre{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4);border-color:rgba(255,255,255,0.1)}
        .adm-badge.flagged{background:rgba(255,95,95,0.1);color:#ff5f5f;border-color:rgba(255,95,95,0.25)}

        .adm-btn{display:inline-block;padding:0.5rem 1rem;border-radius:8px;font-size:0.8rem;font-weight:700;text-decoration:none;cursor:pointer;border:none;transition:opacity 0.2s}
        .adm-btn.primary{background:#00e87a;color:#080c12}
        .adm-btn.secondary{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7)}
        .adm-btn:hover{opacity:0.85}

        .adm-bar-row{display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;font-size:0.8rem}
        .adm-bar-label{width:140px;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.75rem}
        .adm-bar-track{flex:1;height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden}
        .adm-bar-fill{height:100%;border-radius:3px;background:#3d8bff}
        .adm-bar-count{width:40px;text-align:right;color:rgba(255,255,255,0.35);font-size:0.72rem}

        .adm-loading{text-align:center;padding:5rem;color:rgba(255,255,255,0.25)}

        .adm-action-log-row{display:flex;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.8rem;align-items:flex-start}
        .adm-action-log-row:last-child{border-bottom:none}
        .adm-log-time{color:rgba(255,255,255,0.2);font-size:0.72rem;white-space:nowrap;min-width:90px;font-family:monospace}
        .adm-log-action{font-weight:700;text-transform:uppercase;font-size:0.68rem;padding:2px 6px;border-radius:4px;white-space:nowrap}
        .adm-log-claim{background:rgba(0,232,122,0.1);color:#00e87a}
        .adm-log-register{background:rgba(61,139,255,0.1);color:#3d8bff}
        .adm-log-flag{background:rgba(255,95,95,0.1);color:#ff5f5f}
        .adm-log-edit{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4)}
        .adm-log-name{color:rgba(255,255,255,0.65)}

        .adm-input{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 12px;color:#f0f4ff;font-size:0.85rem;outline:none;width:100%;box-sizing:border-box;transition:border-color 0.2s}
        .adm-input:focus{border-color:rgba(0,232,122,0.4)}
        .adm-input-row{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:0.5rem;align-items:end;margin-bottom:0.75rem}
        .adm-input-label{font-size:0.7rem;color:rgba(255,255,255,0.3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.06em}
        .adm-admins-row{display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.82rem}
        .adm-admins-row:last-child{border-bottom:none}
        .adm-admins-id{font-family:monospace;font-size:0.75rem;color:rgba(255,255,255,0.35)}
        .adm-admins-name{color:#f0f4ff;font-weight:600}
        .adm-admins-email{color:rgba(255,255,255,0.4);font-size:0.78rem}
        .adm-remove-btn{background:rgba(255,95,95,0.1);border:1px solid rgba(255,95,95,0.2);color:#ff5f5f;border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;transition:opacity 0.2s}
        .adm-remove-btn:hover{opacity:0.75}
        .adm-success{color:#00e87a;font-size:0.8rem;margin-top:6px}
        .adm-err{color:#ff5f5f;font-size:0.8rem;margin-top:6px}

        .adm-users-search{display:flex;gap:0.5rem;margin-bottom:1rem}
        .adm-role-select{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;color:#f0f4ff;font-size:0.78rem;outline:none;cursor:pointer}
        .adm-code-pill{font-family:monospace;font-size:0.75rem;background:rgba(0,232,122,0.08);color:#00e87a;border:1px solid rgba(0,232,122,0.2);border-radius:5px;padding:2px 8px;cursor:pointer;user-select:all}
        .adm-code-pill:hover{background:rgba(0,232,122,0.15)}
        .adm-gen-btn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:6px;padding:3px 10px;font-size:0.72rem;font-weight:600;cursor:pointer;white-space:nowrap}
        .adm-gen-btn:hover{background:rgba(255,255,255,0.1)}
        .adm-gen-btn:disabled{opacity:0.35;cursor:not-allowed}
        .adm-pagination{display:flex;gap:0.5rem;align-items:center;margin-top:1rem;font-size:0.8rem;color:rgba(255,255,255,0.35)}

        @media(max-width:768px){
          .adm-two-col{grid-template-columns:1fr}
          .adm-stat-grid{grid-template-columns:repeat(2,1fr)}
          .adm-shell{padding:1.5rem 1rem 4rem}
          .adm-input-row{grid-template-columns:1fr}
        }
      `}</style>

      <div className="adm-root">
        <nav className="adm-nav">
          <Link href="/" className="adm-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <div className="adm-nav-links">
            <Link href="/admin" className="adm-nav-link active">Dashboard</Link>
            <Link href="/admin/directory" className="adm-nav-link">Directory</Link>
            <Link href="/admin/waitlist" className="adm-nav-link">Waitlist</Link>
            <Link href="/admin/corporate" className="adm-nav-link">Corporate</Link>
            <Link href="/admin/outreach" className="adm-nav-link">Outreach</Link>
            <Link href="/admin/white-label" className="adm-nav-link">White Label</Link>
            <Link href="/admin/blueprint" className="adm-nav-link">Blueprint</Link>
            <span className="adm-nav-badge">ADMIN</span>
            <AppNav drawerOnly />
          </div>
        </nav>

        <div className="adm-shell">
          <div className="adm-eyebrow">Admin</div>
          <h1 className="adm-h1">Platform Dashboard</h1>

          {loading ? (
            <div className="adm-loading">Loading stats…</div>
          ) : !stats ? (
            <div className="adm-loading">Failed to load stats.</div>
          ) : (
            <>
              {/* ── Stat cards ── */}
              <div className="adm-stat-grid">
                <div className="adm-stat">
                  <div className="adm-stat-val">{f$(stats.totals.all)}</div>
                  <div className="adm-stat-label">Total Listings</div>
                </div>
                <div className="adm-stat green">
                  <div className="adm-stat-val">{stats.totals.claimed}</div>
                  <div className="adm-stat-label">Claimed Profiles</div>
                </div>
                <div className="adm-stat">
                  <div className="adm-stat-val">{claimRate}%</div>
                  <div className="adm-stat-label">Claim Rate</div>
                </div>
                <div className="adm-stat">
                  <div className="adm-stat-val">{f$(stats.totals.unclaimed)}</div>
                  <div className="adm-stat-label">Unclaimed</div>
                </div>
                <div className="adm-stat" style={{ borderColor: "rgba(61,139,255,0.2)" }}>
                  <div className="adm-stat-val" style={{ color: "#3d8bff" }}>{stats.totals.self}</div>
                  <div className="adm-stat-label">Self-Registered</div>
                </div>
                {stats.totals.flagged > 0 && (
                  <div className="adm-stat red">
                    <div className="adm-stat-val">{stats.totals.flagged}</div>
                    <div className="adm-stat-label">Flagged</div>
                  </div>
                )}
              </div>

              <div className="adm-two-col">
                {/* ── By type ── */}
                <div className="adm-section">
                  <div className="adm-section-title">By License Type</div>
                  {Object.entries(stats.byType as Record<string, number>)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => {
                      const max = Math.max(...Object.values(stats.byType as Record<string, number>));
                      return (
                        <div key={type} className="adm-bar-row">
                          <div className="adm-bar-label">{PRO_TYPE_LABEL[type] ?? type}</div>
                          <div className="adm-bar-track">
                            <div className="adm-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
                          </div>
                          <div className="adm-bar-count">{count >= 1000 ? `${(count / 1000).toFixed(0)}k` : count}</div>
                        </div>
                      );
                    })}
                </div>

                {/* ── Top cities ── */}
                <div className="adm-section">
                  <div className="adm-section-title">Top Cities</div>
                  {(stats.topCities as { city: string; count: number }[]).map(({ city, count }) => {
                    const max = stats.topCities[0]?.count ?? 1;
                    return (
                      <div key={city} className="adm-bar-row">
                        <div className="adm-bar-label">{city}</div>
                        <div className="adm-bar-track">
                          <div className="adm-bar-fill" style={{ width: `${(count / max) * 100}%`, background: "#00e87a" }} />
                        </div>
                        <div className="adm-bar-count">{count >= 1000 ? `${(count / 1000).toFixed(0)}k` : count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Recent claims ── */}
              <div className="adm-section">
                <div className="adm-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Recent Claims</span>
                  <Link href="/admin/directory?status=claimed" className="adm-btn secondary" style={{ padding: "3px 10px", fontSize: "0.72rem" }}>View all →</Link>
                </div>
                {stats.recentClaims.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>No claims yet — listings are seeded and waiting.</p>
                ) : (
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>City</th>
                        <th>Source</th>
                        <th>Claimed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentClaims.map((c: any) => (
                        <tr key={c.id}>
                          <td style={{ color: "#f0f4ff", fontWeight: 600 }}>{c.name}</td>
                          <td><span className="adm-badge dre">{PRO_TYPE_LABEL[c.pro_type] ?? c.pro_type}</span></td>
                          <td>{c.city ?? "—"}</td>
                          <td><span className={`adm-badge ${c.source === "self" ? "self" : "dre"}`}>{c.source === "self" ? "Self" : "DRE"}</span></td>
                          <td style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.72rem" }}>
                            {c.claimed_at ? new Date(c.claimed_at).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* ── Activity log ── */}
              <div className="adm-section">
                <div className="adm-section-title">Activity Log</div>
                {stats.recentActivity.length === 0 ? (
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.85rem" }}>No admin actions logged yet.</p>
                ) : (
                  <div>
                    {stats.recentActivity.map((entry: any) => (
                      <div key={entry.id} className="adm-action-log-row">
                        <span className="adm-log-time">
                          {new Date(entry.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className={`adm-log-action adm-log-${entry.action}`}>{entry.action}</span>
                        <span className="adm-log-name">{entry.target_name}</span>
                        {entry.notes && <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.72rem" }}>{entry.notes}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Quick actions ── */}
              <div className="adm-section">
                <div className="adm-section-title">Quick Actions</div>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Link href="/admin/directory" className="adm-btn primary">Browse Directory →</Link>
                  <Link href="/admin/directory?status=flagged" className="adm-btn secondary">Review Flagged</Link>
                  <Link href="/professionals" className="adm-btn secondary">View Public Directory</Link>
                </div>
              </div>

              {/* ── Founding 500 ── */}
              <div className="adm-section">
                <div className="adm-section-title">Founding 500</div>
                {foundingStats ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
                    {/* Mini counter */}
                    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${foundingStats.remaining <= 50 ? "rgba(217,119,6,0.35)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: "14px 20px", minWidth: 160 }}>
                      <div style={{ fontSize: "1.8rem", fontWeight: 800, color: foundingStats.remaining <= 50 ? "#d97706" : "#f0f4ff", lineHeight: 1 }}>
                        {foundingStats.claimed} <span style={{ fontSize: "1rem", color: "rgba(255,255,255,0.3)" }}>/ 500</span>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 6 }}>
                        {foundingStats.remaining} spots left
                      </div>
                      {/* progress bar */}
                      <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 999, marginTop: 10, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 999, width: `${Math.min((foundingStats.claimed / 500) * 100, 100)}%`, background: foundingStats.remaining <= 50 ? "#d97706" : "#00e87a" }} />
                      </div>
                    </div>

                    {/* Blast button + result */}
                    <div>
                      {foundingStats.remaining <= 100 && (
                        <div style={{ fontSize: "0.8rem", color: "#d97706", marginBottom: 8, fontWeight: 600 }}>
                          ⚠️ {foundingStats.remaining <= 50 ? "Critical —" : "Approaching limit —"} consider sending urgency blast
                        </div>
                      )}
                      <button
                        className="adm-btn"
                        style={{ background: "rgba(217,119,6,0.15)", color: "#d97706", border: "1px solid rgba(217,119,6,0.3)" }}
                        onClick={handleFoundingBlast}
                        disabled={blasting}
                      >
                        {blasting ? "Sending…" : "Send urgency blast to all founding members →"}
                      </button>
                      {blastResult && (
                        <div style={{ fontSize: "0.8rem", color: blastResult.startsWith("Error") ? "#ff5f5f" : "#00e87a", marginTop: 6 }}>
                          {blastResult}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.82rem" }}>Loading…</p>
                )}
              </div>

              {/* ── Consumer Invite ── */}
              <div className="adm-section">
                <div className="adm-section-title">Consumer Invite</div>
                <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.35)", marginBottom: "1.25rem" }}>
                  Send a personalised invite email with pre-loaded credits. The recipient clicks the link, signs up, and credits are auto-granted instantly.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", maxWidth: 520 }}>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Email</div>
                    <input className="adm-input" placeholder="email@example.com" value={ciEmail} onChange={e => setCiEmail(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Full Name</div>
                    <input className="adm-input" placeholder="First Last" value={ciName} onChange={e => setCiName(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Phone (optional)</div>
                    <input className="adm-input" placeholder="(555) 000-0000" value={ciPhone} onChange={e => setCiPhone(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Credits</div>
                    <input className="adm-input" type="number" min={1} max={10000} placeholder="25" value={ciCredits} onChange={e => setCiCredits(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Personal Note (optional)</div>
                    <input className="adm-input" placeholder="e.g. Great meeting you at Pepperdine…" value={ciNote} onChange={e => setCiNote(e.target.value)} style={{ width: "100%" }} />
                  </div>
                </div>
                <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                  <button
                    className="adm-btn primary"
                    onClick={sendConsumerInvite}
                    disabled={ciSending || !ciEmail.trim() || !ciName.trim() || !parseInt(ciCredits)}
                  >
                    {ciSending ? "Sending…" : "Send Invite →"}
                  </button>
                  {ciResult && (
                    <div style={{ fontSize: "0.82rem", color: ciResult.ok ? "#00e87a" : "#ff5f5f" }}>
                      {ciResult.msg}
                      {ciResult.ok && ciResult.url && (
                        <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.3)", fontSize: "0.72rem" }}>
                          Link: <a href={ciResult.url} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)" }}>{ciResult.url}</a>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Manage Users ── */}
              <div className="adm-section">
                <div className="adm-section-title">Manage Users</div>
                <div className="adm-users-search">
                  <input
                    className="adm-input"
                    placeholder="Search by email or name…"
                    value={usersSearch}
                    onChange={e => setUsersSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") fetchUsers(0, usersSearch); }}
                    style={{ maxWidth: 320 }}
                  />
                  <button className="adm-btn secondary" onClick={() => fetchUsers(0, usersSearch)}>Search</button>
                  {usersSearch && <button className="adm-btn secondary" onClick={() => { setUsersSearch(""); fetchUsers(0, ""); }}>Clear</button>}
                </div>

                {usersLoading ? (
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.82rem" }}>Loading…</p>
                ) : (
                  <>
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>Email / Name</th>
                          <th>Role</th>
                          <th>Referral Code</th>
                          <th>Joined</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => {
                          const isUpdating = updatingUser === u.id;
                          const isGranting = granting === u.id;
                          const isGrantOpen = grantOpen === u.id;
                          const msg = userMsg?.id === u.id ? userMsg : null;
                          return (
                            <>
                            <tr key={u.id}>
                              <td>
                                <div style={{ fontWeight: 600, color: "#f0f4ff", fontSize: "0.83rem" }}>{u.full_name || "—"}</div>
                                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.72rem" }}>{u.email}</div>
                              </td>
                              <td>
                                <select
                                  className="adm-role-select"
                                  value={u.role}
                                  disabled={isUpdating}
                                  onChange={e => updateUser(u.id, { role: e.target.value })}
                                >
                                  <option value="borrower">Borrower</option>
                                  <option value="lo">Loan Officer</option>
                                  <option value="agent">Agent</option>
                                </select>
                              </td>
                              <td>
                                {u.referral_code ? (
                                  <span
                                    className="adm-code-pill"
                                    title="Click to copy referral link"
                                    onClick={() => {
                                      const link = `${window.location.origin}/r/${u.referral_code}`;
                                      navigator.clipboard.writeText(link);
                                      setCopiedCode(u.id);
                                      setTimeout(() => setCopiedCode(null), 2000);
                                    }}
                                  >
                                    {copiedCode === u.id ? "Copied!" : u.referral_code}
                                  </span>
                                ) : (
                                  <button
                                    className="adm-gen-btn"
                                    disabled={isUpdating}
                                    onClick={() => updateUser(u.id, { action: "generate_code" })}
                                  >
                                    {isUpdating ? "…" : "Generate"}
                                  </button>
                                )}
                              </td>
                              <td style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.72rem" }}>
                                {new Date(u.created_at).toLocaleDateString()}
                              </td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                <button
                                  className="adm-gen-btn"
                                  style={{ color: isGrantOpen ? "#00e87a" : undefined, borderColor: isGrantOpen ? "rgba(0,232,122,0.3)" : undefined }}
                                  onClick={() => { setGrantOpen(isGrantOpen ? null : u.id); setUserMsg(null); }}
                                >
                                  Grant Credits
                                </button>
                                {msg && (
                                  <span style={{ fontSize: "0.72rem", color: msg.ok ? "#00e87a" : "#ff5f5f", marginLeft: 8 }}>
                                    {msg.msg}
                                  </span>
                                )}
                              </td>
                            </tr>
                            {isGrantOpen && (
                              <tr key={`${u.id}-grant`}>
                                <td colSpan={5} style={{ padding: "0 10px 12px", background: "rgba(0,232,122,0.03)" }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 8 }}>
                                    {[100, 250, 500, 1000].map(p => (
                                      <button key={p} className="adm-gen-btn"
                                        style={{
                                          borderColor: grantAmount[u.id] === String(p) ? "rgba(0,232,122,0.5)" : undefined,
                                          color: grantAmount[u.id] === String(p) ? "#00e87a" : undefined,
                                        }}
                                        onClick={() => setGrantAmount(prev => ({ ...prev, [u.id]: String(p) }))}
                                      >{p}</button>
                                    ))}
                                    <input
                                      type="number" min={1} max={100000}
                                      placeholder="Custom"
                                      value={grantAmount[u.id] ?? ""}
                                      onChange={e => setGrantAmount(prev => ({ ...prev, [u.id]: e.target.value }))}
                                      className="adm-input"
                                      style={{ width: 90, padding: "4px 8px" }}
                                    />
                                    <input
                                      type="text"
                                      placeholder="Note (optional)"
                                      value={grantNote[u.id] ?? ""}
                                      onChange={e => setGrantNote(prev => ({ ...prev, [u.id]: e.target.value }))}
                                      className="adm-input"
                                      style={{ width: 180, padding: "4px 8px" }}
                                    />
                                    <button
                                      className="adm-btn primary"
                                      style={{ padding: "5px 16px", fontSize: "0.8rem" }}
                                      disabled={isGranting || !grantAmount[u.id] || parseInt(grantAmount[u.id] ?? "0") < 1}
                                      onClick={() => grantCredits(u.id)}
                                    >{isGranting ? "Granting…" : "Grant"}</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pagination */}
                    <div className="adm-pagination">
                      <button className="adm-btn secondary" style={{ padding: "3px 10px" }}
                        disabled={usersPage === 0}
                        onClick={() => fetchUsers(usersPage - 1, usersSearch)}>← Prev</button>
                      <span>Page {usersPage + 1} of {Math.max(1, Math.ceil(usersTotal / 50))}</span>
                      <button className="adm-btn secondary" style={{ padding: "3px 10px" }}
                        disabled={(usersPage + 1) * 50 >= usersTotal}
                        onClick={() => fetchUsers(usersPage + 1, usersSearch)}>Next →</button>
                      <span style={{ marginLeft: "auto" }}>{usersTotal} total users</span>
                    </div>
                  </>
                )}
              </div>

              {/* ── Manage Admins ── */}
              <div className="adm-section">
                <div className="adm-section-title">Manage Admins</div>
                <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.35)", marginBottom: "1.25rem" }}>
                  Admins have full access to this panel and the debug overlay in Chat. Get a user&apos;s Clerk ID from{" "}
                  <a href="https://dashboard.clerk.com" target="_blank" rel="noreferrer" style={{ color: "#3d8bff" }}>dashboard.clerk.com</a> → Users.
                </p>

                {/* Existing admins */}
                {adminsLoading ? (
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.82rem" }}>Loading…</p>
                ) : (
                  <div style={{ marginBottom: "1.5rem", background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "0 1rem", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {admins.length === 0 ? (
                      <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.82rem", padding: "0.75rem 0" }}>No admins in database yet — bootstrap admin (hardcoded) always has access.</p>
                    ) : admins.map(a => (
                      <div key={a.clerk_user_id} className="adm-admins-row">
                        <div>
                          <div className="adm-admins-name">{a.display_name || "—"}</div>
                          <div className="adm-admins-email">{a.email || ""}</div>
                          <div className="adm-admins-id">{a.clerk_user_id}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.72rem" }}>
                            {a.added_at ? new Date(a.added_at).toLocaleDateString() : ""}
                          </span>
                          {a.clerk_user_id !== user?.id && (
                            <button className="adm-remove-btn" onClick={() => handleRemoveAdmin(a.clerk_user_id)}>Remove</button>
                          )}
                          {a.clerk_user_id === user?.id && (
                            <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.2)" }}>you</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add admin form */}
                <form onSubmit={handleAddAdmin}>
                  <div className="adm-input-row">
                    <div>
                      <div className="adm-input-label">Clerk User ID *</div>
                      <input className="adm-input" placeholder="user_xxxxxxxxxx" value={newAdminId} onChange={e => setNewAdminId(e.target.value)} required />
                    </div>
                    <div>
                      <div className="adm-input-label">Name</div>
                      <input className="adm-input" placeholder="Jane Smith" value={newAdminName} onChange={e => setNewAdminName(e.target.value)} />
                    </div>
                    <div>
                      <div className="adm-input-label">Email</div>
                      <input className="adm-input" placeholder="jane@example.com" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} />
                    </div>
                    <button type="submit" className="adm-btn primary" style={{ height: 38, whiteSpace: "nowrap" }}>Add Admin</button>
                  </div>
                  {addError && <div className="adm-err">{addError}</div>}
                  {addSuccess && <div className="adm-success">Admin added ✓</div>}
                </form>
              </div>
            </>
          )}

          {/* ── Private Exchange — Scenario Management ── */}
          <div className="adm-section">
            <div className="adm-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Private Exchange — Scenarios ({adminScenarios.length})</span>
              <button className="adm-btn secondary" style={{ fontSize: "0.72rem", padding: "4px 10px" }} onClick={fetchAdminScenarios}>Refresh</button>
            </div>
            {scenariosLoading ? (
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.8rem", padding: "1rem 0" }}>Loading…</div>
            ) : adminScenarios.length === 0 ? (
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.8rem", padding: "1rem 0" }}>No scenarios.</div>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>State</th>
                    <th>Price</th>
                    <th>Vis.</th>
                    <th>Status</th>
                    <th>Resp.</th>
                    <th>Posted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminScenarios.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "0.75rem" }}>{s.loan_type}</td>
                      <td>{s.state}</td>
                      <td style={{ fontSize: "0.78rem" }}>{s.price_range}</td>
                      <td>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: s.visibility === "private" ? "rgba(255,140,66,0.1)" : "rgba(0,232,122,0.08)", color: s.visibility === "private" ? "#ff8c42" : "#00e87a" }}>
                          {s.visibility}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.72rem", color: s.status === "active" ? "#00e87a" : s.status === "matched" ? "#3d8bff" : "rgba(255,255,255,0.3)" }}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ color: "rgba(255,255,255,0.5)" }}>{s.response_count}/{s.max_responses}</td>
                      <td style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.72rem" }}>
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        {scenarioMsg?.id === s.id ? (
                          <span style={{ fontSize: "0.72rem", color: "#00e87a" }}>{scenarioMsg?.msg}</span>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            {s.status !== "archived" && (
                              <button className="adm-btn secondary" style={{ fontSize: "0.68rem", padding: "3px 8px" }} onClick={() => adminScenarioAction(s.id, "archive")}>Archive</button>
                            )}
                            <button className="adm-remove-btn" style={{ fontSize: "0.68rem" }} onClick={() => adminScenarioAction(s.id, "delete")}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── LO Networks ──────────────────────────────────────────────── */}
          {isAdmin && (
            <>
              <div className="adm-section-title" style={{ marginTop: 40 }}>LO Networks</div>
              <div className="adm-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: "0.85rem", color: "rgba(185,208,192,0.6)" }}>
                    {los.length} loan officers · click to expand borrower list
                  </span>
                  <button className="adm-btn" onClick={fetchLos} disabled={losLoading} style={{ fontSize: "0.78rem" }}>
                    {losLoading ? "Loading…" : "↻ Refresh"}
                  </button>
                </div>

                {los.length === 0 && !losLoading && (
                  <div style={{ color: "rgba(185,208,192,0.4)", fontSize: "0.85rem" }}>No LOs found.</div>
                )}

                {los.map(lo => {
                  const isExpanded = expandedLo === lo.id;
                  const borrowers  = loBorrowers[lo.id] ?? [];
                  const isLoading  = borrowersLoading === lo.id;
                  return (
                    <div key={lo.id} style={{ marginBottom: 10, border: "1px solid rgba(148,163,184,0.12)", borderRadius: 10, overflow: "hidden" }}>
                      {/* LO header row */}
                      <div
                        onClick={() => toggleLo(lo.id)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", background: isExpanded ? "rgba(0,232,122,0.04)" : "transparent" }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, color: "#e0f0e8", fontSize: "0.9rem" }}>{lo.name}</span>
                          {lo.lender && <span style={{ marginLeft: 10, fontSize: "0.78rem", color: "rgba(185,208,192,0.5)" }}>{lo.lender}</span>}
                          <span style={{ marginLeft: 10, fontSize: "0.78rem", color: "rgba(185,208,192,0.4)" }}>{lo.email}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: "0.8rem", color: lo.borrower_count > 0 ? "rgba(0,232,122,0.7)" : "rgba(148,163,184,0.4)" }}>
                            {lo.borrower_count} borrower{lo.borrower_count !== 1 ? "s" : ""}
                          </span>
                          <span style={{ color: "rgba(185,208,192,0.5)", fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Borrower list */}
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid rgba(148,163,184,0.1)", padding: "0 16px 12px" }}>
                          {isLoading && <div style={{ padding: "12px 0", fontSize: "0.82rem", color: "rgba(185,208,192,0.4)" }}>Loading borrowers…</div>}
                          {!isLoading && borrowers.length === 0 && (
                            <div style={{ padding: "12px 0", fontSize: "0.82rem", color: "rgba(185,208,192,0.4)" }}>No borrowers yet.</div>
                          )}
                          {!isLoading && borrowers.map(b => {
                            const dKey = b.id + "_digest";
                            const pKey = b.id + "_preview";
                            return (
                              <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(148,163,184,0.07)", flexWrap: "wrap", gap: 8 }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, color: "#e0f0e8", fontSize: "0.85rem" }}>{b.name}</div>
                                  <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.45)" }}>{b.email ?? "no email"}</div>
                                  {b.property_address && (
                                    <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.5)", marginTop: 2 }}>{b.property_address}</div>
                                  )}
                                  {(b.actual_balance || b.actual_rate) && (
                                    <div style={{ fontSize: "0.72rem", color: "rgba(0,232,122,0.6)", marginTop: 2 }}>
                                      {b.actual_balance ? `$${Math.round(b.actual_balance).toLocaleString()} balance` : ""}
                                      {b.actual_balance && b.actual_rate ? " · " : ""}
                                      {b.actual_rate ? `${b.actual_rate}% rate` : ""}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                                  {b.property_address && (
                                    <a
                                      href={`/my-home?borrower_id=${b.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(0,232,122,0.3)", color: "rgba(0,232,122,0.8)", fontSize: "0.75rem", fontWeight: 600, textDecoration: "none" }}
                                    >
                                      View Home →
                                    </a>
                                  )}
                                  {b.property_address && b.email && (
                                    <button
                                      onClick={() => adminSendDigest(b.id, lo.id, false)}
                                      disabled={digestSending === dKey}
                                      style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.2)", color: "rgba(185,208,192,0.7)", fontSize: "0.75rem", fontWeight: 600, background: "transparent", cursor: "pointer" }}
                                    >
                                      {digestSending === dKey ? "Sending…" : digestMsg[dKey] ?? "Send Digest"}
                                    </button>
                                  )}
                                  {b.property_address && (
                                    <button
                                      onClick={() => adminSendDigest(b.id, lo.id, true)}
                                      disabled={digestSending === pKey}
                                      style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(99,179,237,0.3)", color: "rgba(99,179,237,0.8)", fontSize: "0.75rem", fontWeight: 600, background: "transparent", cursor: "pointer" }}
                                    >
                                      {digestSending === pKey ? "Sending…" : digestMsg[pKey] ?? "Preview →Me"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
