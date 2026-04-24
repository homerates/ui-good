"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

// ── Types ────────────────────────────────────────────────────────────────────

type Room = {
  id: string;
  property_address: string;
  status: string;
  offer_price: number | null;
  target_close_date: string | null;
  property_data: any;
  created_by: string;
  updated_at: string;
};
type Member = {
  id: string; deal_room_id: string; role: string;
  user_id: string | null; display_name: string | null;
  email: string | null; invite_token: string;
  invited_at: string; joined_at: string | null;
};
type Milestone = {
  id: string; deal_room_id: string; milestone_key: string;
  label: string; stage: string; sort_order: number;
  target_date: string | null; completed_at: string | null; ai_note: string | null;
};
type Message = {
  id: string; deal_room_id: string; sender_id: string;
  sender_role: string; sender_name: string | null; content: string; created_at: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ["shopping", "offer", "contract", "processing", "closed"] as const;
const STATUS_LABELS: Record<string, string> = {
  shopping: "Shopping", offer: "Offer", contract: "In Contract",
  processing: "Processing", closed: "Closed", cancelled: "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  shopping: "#3d8bff", offer: "#ff8c42", contract: "#a78bfa",
  processing: "#fbbf24", closed: "#00e87a", cancelled: "#6b7a99",
};
const ROLE_LABELS: Record<string, string> = { buyer: "Buyer", lo: "Loan Officer", agent: "Agent" };
const ROLE_COLORS: Record<string, string> = { buyer: "#3d8bff", lo: "#00e87a", agent: "#a78bfa" };

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : `$${Math.round(n/1000)}k`; }
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)  return "just now";
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DealRoomPage() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const roomId = params?.id as string;

  const [room,       setRoom]       = React.useState<Room | null>(null);
  const [members,    setMembers]    = React.useState<Member[]>([]);
  const [milestones, setMilestones] = React.useState<Milestone[]>([]);
  const [messages,   setMessages]   = React.useState<Message[]>([]);
  const [viewerRole, setViewerRole] = React.useState<string>("");
  const [loading,    setLoading]    = React.useState(true);
  const [activeTab,  setActiveTab]  = React.useState<"timeline"|"messages"|"team">("timeline");

  // Message compose
  const [draft,    setDraft]    = React.useState("");
  const [sending,  setSending]  = React.useState(false);
  const msgEndRef = React.useRef<HTMLDivElement>(null);

  // Invite panel
  const [showInvite, setShowInvite] = React.useState(false);
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [inviteLinks, setInviteLinks] = React.useState<Record<string,string>>({});
  const [copiedRole, setCopiedRole] = React.useState<string|null>(null);

  // Status update
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  async function loadRoom() {
    const res = await fetch(`/api/deal-rooms/${roomId}`);
    if (!res.ok) { router.replace("/deal-rooms"); return; }
    const d = await res.json();
    setRoom(d.room);
    setMembers(d.members);
    setMilestones(d.milestones);
    setMessages(d.messages);
    // Determine viewer role
    const mine = (d.members as Member[]).find((m) => m.user_id === d.viewerUserId);
    if (mine) setViewerRole(mine.role);
    else if (d.room.created_by === d.viewerUserId) setViewerRole("lo");
    setLoading(false);
  }

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.replace("/sign-in"); return; }
    if (roomId) loadRoom();
  }, [isLoaded, isSignedIn, roomId]);

  // Auto-scroll messages
  React.useEffect(() => {
    if (activeTab === "messages") msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  // Poll messages every 8s when on messages tab
  React.useEffect(() => {
    if (activeTab !== "messages") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/deal-rooms/${roomId}/messages`);
      if (res.ok) { const d = await res.json(); setMessages(d.messages); }
    }, 8_000);
    return () => clearInterval(t);
  }, [activeTab, roomId]);

  async function sendMessage() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/deal-rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    if (res.ok) {
      const d = await res.json();
      setMessages((prev) => [...prev, d.message]);
      setDraft("");
    }
    setSending(false);
  }

  async function toggleMilestone(key: string, current: boolean) {
    const res = await fetch(`/api/deal-rooms/${roomId}/milestones`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ milestone_key: key, completed: !current }),
    });
    if (res.ok) {
      const d = await res.json();
      setMilestones((prev) => prev.map((m) => m.milestone_key === key ? d.milestone : m));
    }
  }

  async function updateStatus(newStatus: string) {
    if (!room || updatingStatus) return;
    setUpdatingStatus(true);
    const res = await fetch(`/api/deal-rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) { const d = await res.json(); setRoom(d.room); }
    setUpdatingStatus(false);
  }

  async function loadInviteLinks() {
    setInviteLoading(true);
    const res = await fetch(`/api/deal-rooms/${roomId}/invite`);
    if (res.ok) {
      const d = await res.json();
      const links: Record<string, string> = {};
      for (const m of d.members as Member[]) {
        if (m.invite_token) {
          links[m.role] = `${window.location.origin}/deal-rooms/join?token=${m.invite_token}`;
        }
      }
      setInviteLinks(links);
    }
    setInviteLoading(false);
  }

  async function generateInvite(role: string) {
    const res = await fetch(`/api/deal-rooms/${roomId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) loadInviteLinks();
  }

  function copyInvite(role: string) {
    const link = inviteLinks[role];
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedRole(role);
    setTimeout(() => setCopiedRole(null), 2000);
  }

  if (loading) return (
    <div style={{ background: "#080c12", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#6b7a99", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Loading room…</p>
    </div>
  );

  if (!room) return null;

  const color = STATUS_COLOR[room.status] ?? "#6b7a99";
  const pd = room.property_data;
  const completedCount = milestones.filter((m) => m.completed_at).length;
  const isCreator = room.created_by === userId;

  // Group milestones by stage
  const milestonesByStage: Record<string, Milestone[]> = {};
  for (const m of milestones) {
    (milestonesByStage[m.stage] ??= []).push(m);
  }

  return (
    <div style={{ background: "#080c12", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#f0f4ff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .dr-tab { background: none; border: none; color: #6b7a99; font-size: 13px; font-weight: 500; padding: 8px 14px; cursor: pointer; border-radius: 8px; font-family: inherit; transition: color 0.15s, background 0.15s; }
        .dr-tab:hover { color: #f0f4ff; }
        .dr-tab.active { color: #f0f4ff; background: rgba(255,255,255,0.07); }
        .dr-card { background: #0e1420; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 20px; }
        .dr-btn-primary { background: #00e87a; color: #080c12; border: none; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .dr-btn-primary:hover { background: #00c96a; }
        .dr-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .dr-btn-ghost { background: transparent; color: #6b7a99; border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .dr-btn-ghost:hover { border-color: rgba(255,255,255,0.15); color: #f0f4ff; }
        .ms-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; }
        .ms-row:last-child { border-bottom: none; }
        .ms-check { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .ms-check.done { background: #00e87a; border-color: #00e87a; }
        .ms-row:hover .ms-check:not(.done) { border-color: rgba(255,255,255,0.4); }
        .msg-bubble { padding: 10px 14px; border-radius: 10px; max-width: 75%; }
        .msg-self { background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.15); margin-left: auto; }
        .msg-other { background: #141b28; border: 1px solid rgba(255,255,255,0.07); }
        .msg-system { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); margin: 0 auto; text-align: center; font-size: 12px; color: #6b7a99; padding: 6px 14px; border-radius: 20px; max-width: 90%; }
        .dr-compose { display: flex; gap: 10px; align-items: flex-end; background: #0e1420; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px; }
        .dr-compose textarea { flex: 1; background: none; border: none; color: #f0f4ff; font-size: 14px; font-family: inherit; resize: none; outline: none; line-height: 1.5; max-height: 120px; }
        .dr-compose textarea::placeholder { color: #3a4560; }
        .status-chip { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; cursor: pointer; border: 1px solid; transition: opacity 0.15s; }
        .status-chip:hover { opacity: 0.75; }
        .invite-link { background: #141b28; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #6b7a99; font-family: 'DM Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .stage-label { font-size: 10px; color: #3a4560; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin: 16px 0 6px; }
        .stage-label:first-child { margin-top: 0; }
        .member-pill { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #141b28; border-radius: 8px; }
      `}</style>

      {/* Top bar */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, height: 56 }}>
          <button
            onClick={() => router.push("/deal-rooms")}
            style={{ background: "none", border: "none", color: "#6b7a99", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "4px 0", flexShrink: 0 }}
          >
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {room.property_address}
            </p>
          </div>
          <span
            className="status-chip"
            style={{ color, background: `${color}18`, borderColor: `${color}40` }}
            title="Click to advance status"
            onClick={() => {
              if (!isCreator) return;
              const idx = STATUSES.indexOf(room.status as any);
              const next = STATUSES[Math.min(idx + 1, STATUSES.length - 1)];
              if (next !== room.status) updateStatus(next);
            }}
          >
            {STATUS_LABELS[room.status]}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>

        {/* Property snapshot strip */}
        {pd && (
          <div style={{
            background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "14px 20px", marginBottom: 24,
            display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center",
          }}>
            {pd.price       && <Stat label="List Price"  value={fmt(pd.price)} />}
            {pd.estimatedValue && <Stat label="AVM"       value={fmt(pd.estimatedValue)} />}
            {pd.beds        && <Stat label="Beds"        value={String(pd.beds)} />}
            {pd.baths       && <Stat label="Baths"       value={String(pd.baths)} />}
            {pd.sqft        && <Stat label="Sqft"        value={pd.sqft.toLocaleString()} />}
            {pd.listingStatus && (
              <Stat label="Status" value={pd.listingStatus.replace(/_/g, " ")} />
            )}
            {room.target_close_date && (
              <Stat label="Target Close" value={new Date(room.target_close_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} />
            )}
            {room.offer_price && <Stat label="Offer" value={fmt(room.offer_price)} accent />}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20 }}>

          {/* Left — main content */}
          <div>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
              {(["timeline","messages","team"] as const).map((t) => (
                <button key={t} className={`dr-tab${activeTab===t?" active":""}`} onClick={() => setActiveTab(t)}>
                  {t === "timeline" ? `Timeline · ${completedCount}/${milestones.length}` : t === "messages" ? `Messages · ${messages.filter(m=>m.sender_role!=="system").length}` : "Team"}
                </button>
              ))}
            </div>

            {/* Timeline tab */}
            {activeTab === "timeline" && (
              <div className="dr-card">
                {STATUSES.map((stage) => {
                  const items = milestonesByStage[stage];
                  if (!items?.length) return null;
                  return (
                    <React.Fragment key={stage}>
                      <p className="stage-label">{STATUS_LABELS[stage]}</p>
                      {items.map((m) => (
                        <div key={m.milestone_key} className="ms-row" onClick={() => toggleMilestone(m.milestone_key, !!m.completed_at)}>
                          <div className={`ms-check${m.completed_at ? " done" : ""}`}>
                            {m.completed_at && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="#080c12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <p style={{ fontSize: 14, color: m.completed_at ? "#6b7a99" : "#f0f4ff", textDecoration: m.completed_at ? "line-through" : "none", flex: 1 }}>
                            {m.label}
                          </p>
                          {m.completed_at && (
                            <span style={{ fontSize: 11, color: "#3a4560" }}>{timeAgo(m.completed_at)}</span>
                          )}
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* Messages tab */}
            {activeTab === "messages" && (
              <div>
                <div className="dr-card" style={{ padding: "16px", minHeight: 320, maxHeight: 480, overflowY: "auto", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {messages.length === 0 && (
                    <p style={{ color: "#6b7a99", fontSize: 14, textAlign: "center", margin: "auto" }}>
                      No messages yet. Start the conversation.
                    </p>
                  )}
                  {messages.map((msg) => {
                    const isSelf  = msg.sender_id === userId;
                    const isSys   = msg.sender_role === "system";
                    if (isSys) return (
                      <div key={msg.id} className="msg-system">{msg.content}</div>
                    );
                    const rc = ROLE_COLORS[msg.sender_role] ?? "#6b7a99";
                    return (
                      <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isSelf ? "flex-end" : "flex-start" }}>
                        {!isSelf && (
                          <p style={{ fontSize: 11, color: rc, marginBottom: 4, fontWeight: 600 }}>
                            {msg.sender_name ?? ROLE_LABELS[msg.sender_role] ?? msg.sender_role}
                          </p>
                        )}
                        <div className={`msg-bubble ${isSelf ? "msg-self" : "msg-other"}`}>
                          <p style={{ fontSize: 14, lineHeight: 1.5 }}>{msg.content}</p>
                        </div>
                        <p style={{ fontSize: 11, color: "#3a4560", marginTop: 3 }}>{timeAgo(msg.created_at)}</p>
                      </div>
                    );
                  })}
                  <div ref={msgEndRef} />
                </div>
                <div className="dr-compose">
                  <textarea
                    rows={1}
                    placeholder="Message the team…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement;
                      t.style.height = "auto";
                      t.style.height = t.scrollHeight + "px";
                    }}
                  />
                  <button className="dr-btn-primary" style={{ padding: "8px 16px", flexShrink: 0 }} onClick={sendMessage} disabled={!draft.trim() || sending}>
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              </div>
            )}

            {/* Team tab */}
            {activeTab === "team" && (
              <div className="dr-card">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {members.map((m) => {
                    const rc = ROLE_COLORS[m.role] ?? "#6b7a99";
                    return (
                      <div key={m.id} className="member-pill">
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.joined_at ? rc : "#3a4560", flexShrink: 0, display: "inline-block" }} />
                        <span style={{ fontSize: 13, color: "#f0f4ff", flex: 1 }}>
                          {m.display_name ?? (m.joined_at ? ROLE_LABELS[m.role] : `${ROLE_LABELS[m.role]} — pending`)}
                        </span>
                        <span style={{ fontSize: 11, color: rc, fontWeight: 600 }}>{ROLE_LABELS[m.role]}</span>
                      </div>
                    );
                  })}
                </div>
                {isCreator && (
                  <button
                    className="dr-btn-ghost"
                    style={{ marginTop: 16, width: "100%", fontSize: 13 }}
                    onClick={() => { setShowInvite((v) => !v); if (!showInvite) loadInviteLinks(); }}
                  >
                    {showInvite ? "Hide invite links" : "Manage invites"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right rail — invite + quick stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Progress */}
            <div className="dr-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Progress
              </p>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${Math.round(completedCount/Math.max(milestones.length,1)*100)}%`, background: "#00e87a", borderRadius: 4, transition: "width 0.3s" }} />
              </div>
              <p style={{ fontSize: 13, color: "#f0f4ff" }}>{completedCount}<span style={{ color: "#6b7a99" }}>/{milestones.length} steps</span></p>
            </div>

            {/* Team status */}
            <div className="dr-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Team
              </p>
              {(["buyer","lo","agent"] as const).map((role) => {
                const m = members.find((x) => x.role === role);
                const rc = ROLE_COLORS[role];
                return (
                  <div key={role} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: m?.joined_at ? rc : "#3a4560", flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 13, color: m?.joined_at ? "#f0f4ff" : "#6b7a99", flex: 1 }}>
                      {ROLE_LABELS[role]}
                    </span>
                    {!m?.joined_at && isCreator && (
                      <span style={{ fontSize: 11, color: "#3a4560" }}>invite</span>
                    )}
                  </div>
                );
              })}
              {isCreator && (
                <button
                  className="dr-btn-ghost"
                  style={{ marginTop: 8, width: "100%", fontSize: 12, padding: "7px 12px" }}
                  onClick={() => { setActiveTab("team"); setShowInvite(true); loadInviteLinks(); }}
                >
                  + Invite
                </button>
              )}
            </div>

            {/* Offer price */}
            {room.offer_price && (
              <div className="dr-card" style={{ padding: 16 }}>
                <p style={{ fontSize: 11, color: "#6b7a99", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Offer Price</p>
                <p style={{ fontSize: 22, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "#00e87a" }}>{fmt(room.offer_price)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Invite links panel (appears on team tab or via right rail button) */}
        {showInvite && isCreator && activeTab === "team" && (
          <div style={{ background: "#0e1420", border: "1px solid rgba(0,232,122,0.15)", borderRadius: 12, padding: 20, marginTop: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Invite Links</p>
            {inviteLoading && <p style={{ color: "#6b7a99", fontSize: 13 }}>Loading…</p>}
            {!inviteLoading && (["buyer","lo","agent"] as const).map((role) => {
              const existing = members.find((m) => m.role === role);
              const link = inviteLinks[role];
              const joined = existing?.joined_at;
              return (
                <div key={role} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: ROLE_COLORS[role] }}>{ROLE_LABELS[role]}</span>
                    {joined && <span style={{ fontSize: 11, color: "#00e87a" }}>✓ Joined</span>}
                  </div>
                  {!joined && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {link
                        ? <>
                            <span className="invite-link">{link}</span>
                            <button className="dr-btn-ghost" style={{ flexShrink: 0, fontSize: 12, padding: "6px 12px" }} onClick={() => copyInvite(role)}>
                              {copiedRole === role ? "Copied!" : "Copy"}
                            </button>
                          </>
                        : <button className="dr-btn-ghost" style={{ fontSize: 12, padding: "7px 14px" }} onClick={() => generateInvite(role)}>
                            Generate link
                          </button>
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: "#3a4560", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: accent ? "#00e87a" : "#f0f4ff" }}>{value}</p>
    </div>
  );
}
