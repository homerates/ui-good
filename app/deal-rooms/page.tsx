"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import PageShell from "../components/PageShell";
import AddressAutocomplete from "../components/AddressAutocomplete";

const STATUS_LABELS: Record<string, string> = {
  shopping:   "Shopping",
  offer:      "Offer",
  contract:   "In Contract",
  processing: "Processing",
  closed:     "Closed",
  cancelled:  "Cancelled",
};
const STATUS_COLOR: Record<string, string> = {
  shopping:   "#3d8bff",
  offer:      "#ff8c42",
  contract:   "#a78bfa",
  processing: "#fbbf24",
  closed:     "#00e87a",
  cancelled:  "#6b7a99",
};

type Room = {
  id: string;
  property_address: string;
  status: string;
  offer_price: number | null;
  target_close_date: string | null;
  updated_at: string;
  members: { role: string; joined_at: string | null }[];
};

export default function DealRoomsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  const [rooms,      setRooms]      = React.useState<Room[]>([]);
  const [loading,    setLoading]    = React.useState(true);
  const [plan,       setPlan]       = React.useState<string | null>(null);
  const [showNew,    setShowNew]    = React.useState(false);
  const [newAddress, setNewAddress] = React.useState("");
  const [newClose,   setNewClose]   = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.replace("/sign-in"); return; }
    Promise.all([
      fetch("/api/deal-rooms").then((r) => r.json()).then((d) => setRooms(d.rooms ?? [])),
      fetch("/api/user/plan").then((r) => r.json()).then((d) => { if (d?.plan) setPlan(d.plan); }),
    ]).finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, router]);

  const isPro = plan === "pro" || plan === "founding";

  async function createRoom() {
    if (!newAddress.trim() || submitting) return;
    setSubmitting(true);
    try {
      let property_data: any = null;
      try {
        const pr = await fetch("/api/property/lookup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: newAddress }),
        });
        const pd = await pr.json();
        if (pd?.ok) property_data = pd.data;
      } catch { /* non-fatal */ }

      const res = await fetch("/api/deal-rooms", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_address: newAddress, property_data, target_close_date: newClose || null }),
      });
      const data = await res.json();
      if (data.room?.id) router.push(`/deal-rooms/${data.room.id}`);
    } finally { setSubmitting(false); }
  }

  const active = rooms.filter((r) => r.status !== "closed" && r.status !== "cancelled");
  const closed = rooms.filter((r) => r.status === "closed" || r.status === "cancelled");

  return (
    <PageShell backHref="/dashboard" backLabel="Dashboard" maxWidth={780}>
      <style>{`
        .dr-new { background:#0e1420; border:1px solid rgba(0,232,122,0.2); border-radius:12px; padding:24px; margin-bottom:32px; }
        .dr-card { background:#0e1420; border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:18px 20px; cursor:pointer; transition:border-color .15s, transform .15s; margin-bottom:8px; }
        .dr-card:hover { border-color:rgba(255,255,255,0.15); transform:translateY(-1px); }
        .dr-btn { background:#00e87a; color:#080c12; border:none; border-radius:8px; padding:10px 20px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; }
        .dr-btn:hover { background:#00c96a; }
        .dr-btn:disabled { opacity:.5; cursor:not-allowed; }
        .dr-ghost { background:transparent; color:#6b7a99; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:9px 16px; font-size:13px; cursor:pointer; font-family:inherit; }
        .dr-ghost:hover { color:#f0f4ff; border-color:rgba(255,255,255,0.15); }
        .dr-input { background:#141b28; border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#f0f4ff; font-size:14px; padding:11px 14px; width:100%; outline:none; font-family:inherit; }
        .dr-input:focus { border-color:#00e87a; }
        .dr-input::placeholder { color:#3a4560; }
        .dr-lbl { font-size:11px; color:#6b7a99; text-transform:uppercase; letter-spacing:.06em; font-weight:500; margin-bottom:6px; display:block; }
        .dr-sec { font-size:11px; color:#3a4560; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; font-weight:500; }
      `}</style>

      {/* Page header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:28 }}>
        <div>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:700, color:"#f0f4ff", margin:0 }}>
            Deal Rooms
          </h1>
          <p style={{ fontSize:14, color:"#6b7a99", marginTop:4 }}>
            AI workspace for every transaction — property, team, and financing in one place
          </p>
        </div>
        {!showNew && isPro && (
          <button className="dr-btn" style={{ flexShrink:0, marginTop:4 }} onClick={() => setShowNew(true)}>
            + New Room
          </button>
        )}
      </div>

      {/* New room panel */}
      {showNew && isPro && (
        <div className="dr-new">
          <p style={{ fontSize:14, fontWeight:500, marginBottom:18, color:"#f0f4ff" }}>New Deal Room</p>
          <div style={{ marginBottom:14 }}>
            <span className="dr-lbl">Property Address</span>
            <AddressAutocomplete value={newAddress} onChange={setNewAddress} placeholder="Start typing…" className="dr-input" />
          </div>
          <div style={{ marginBottom:22 }}>
            <span className="dr-lbl">Target Close Date (optional)</span>
            <input type="date" className="dr-input" value={newClose} onChange={(e) => setNewClose(e.target.value)} />
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="dr-btn" onClick={createRoom} disabled={submitting || !newAddress.trim()}>
              {submitting ? "Creating…" : "Create Room"}
            </button>
            <button className="dr-ghost" onClick={() => { setShowNew(false); setNewAddress(""); setNewClose(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <p style={{ color:"#6b7a99", fontSize:14, textAlign:"center", padding:"60px 0" }}>Loading…</p>}

      {/* Free account with invited rooms — show their rooms, no upgrade prompt */}
      {!loading && !isPro && rooms.length > 0 && (
        <div>
          <div style={{ background:"rgba(61,139,255,0.06)", border:"1px solid rgba(61,139,255,0.15)", borderRadius:10, padding:"12px 16px", marginBottom:24, fontSize:13, color:"#8fa3b8", lineHeight:1.6 }}>
            You were invited into {rooms.length === 1 ? "this deal room" : "these deal rooms"} by your loan officer. To create your own rooms, you&apos;ll need a Pro account.
          </div>
          {active.map((r) => <RoomCard key={r.id} room={r} onClick={() => router.push(`/deal-rooms/${r.id}`)} />)}
          {closed.length > 0 && (
            <>
              <p className="dr-sec" style={{ marginTop:24 }}>Closed / Cancelled</p>
              {closed.map((r) => <RoomCard key={r.id} room={r} onClick={() => router.push(`/deal-rooms/${r.id}`)} />)}
            </>
          )}
        </div>
      )}

      {/* Free account with no rooms — informational, not an upgrade push */}
      {!loading && !isPro && rooms.length === 0 && (
        <div style={{ textAlign:"center", padding:"72px 0" }}>
          <div style={{ fontSize:32, marginBottom:14 }}>🏠</div>
          <p style={{ fontSize:16, fontWeight:500, color:"#f0f4ff", margin:"0 0 8px" }}>No deal rooms yet</p>
          <p style={{ fontSize:14, color:"#6b7a99", margin:"0 0 0", lineHeight:1.7 }}>
            Deal rooms are created by your loan officer.<br />
            You&apos;ll receive an invite link when your LO opens a room for your transaction.
          </p>
        </div>
      )}

      {/* Pro empty state */}
      {!loading && isPro && rooms.length === 0 && !showNew && (
        <div style={{ textAlign:"center", padding:"72px 0" }}>
          <div style={{ fontSize:32, marginBottom:14 }}>🏠</div>
          <p style={{ fontSize:16, fontWeight:500, color:"#f0f4ff", margin:"0 0 6px" }}>No deal rooms yet</p>
          <p style={{ fontSize:14, color:"#6b7a99", margin:"0 0 22px" }}>
            Create a room for a property and invite your buyer, agent, or loan officer.
          </p>
          <button className="dr-btn" onClick={() => setShowNew(true)}>Create First Room</button>
        </div>
      )}

      {/* Pro active rooms */}
      {!loading && isPro && active.length > 0 && (
        <div style={{ marginBottom:32 }}>
          <p className="dr-sec">Active</p>
          {active.map((r) => <RoomCard key={r.id} room={r} onClick={() => router.push(`/deal-rooms/${r.id}`)} />)}
        </div>
      )}

      {/* Pro closed rooms */}
      {!loading && isPro && closed.length > 0 && (
        <div>
          <p className="dr-sec">Closed / Cancelled</p>
          {closed.map((r) => <RoomCard key={r.id} room={r} onClick={() => router.push(`/deal-rooms/${r.id}`)} />)}
        </div>
      )}
    </PageShell>
  );
}

function RoomCard({ room, onClick }: { room: Room; onClick: () => void }) {
  const color   = STATUS_COLOR[room.status] ?? "#6b7a99";
  const joined  = room.members.filter((m) => m.joined_at).length;
  const total   = room.members.length;

  return (
    <div className="dr-card" onClick={onClick}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:15, fontWeight:500, color:"#f0f4ff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", margin:0 }}>
            {room.property_address}
          </p>
          <div style={{ display:"flex", gap:14, marginTop:5 }}>
            <span style={{ fontSize:12, color:"#6b7a99" }}>{joined}/{total} member{total!==1?"s":""}</span>
            {room.offer_price && <span style={{ fontSize:12, color:"#6b7a99" }}>${(room.offer_price/1000).toFixed(0)}k offer</span>}
            {room.target_close_date && (
              <span style={{ fontSize:12, color:"#6b7a99" }}>
                Close {new Date(room.target_close_date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
              </span>
            )}
          </div>
        </div>
        <span style={{
          fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:20, flexShrink:0,
          background:`${color}18`, color, border:`1px solid ${color}40`,
        }}>
          {STATUS_LABELS[room.status] ?? room.status}
        </span>
      </div>
    </div>
  );
}
