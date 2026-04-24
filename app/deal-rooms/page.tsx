"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
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

  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [newAddress, setNewAddress] = React.useState("");
  const [newCloseDate, setNewCloseDate] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.replace("/sign-in"); return; }
    fetch("/api/deal-rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, router]);

  async function createRoom() {
    if (!newAddress.trim()) return;
    setSubmitting(true);
    try {
      // Optionally fetch property snapshot to seed room
      let property_data: any = null;
      try {
        const pr = await fetch("/api/property/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: newAddress }),
        });
        const pd = await pr.json();
        if (pd?.ok) property_data = pd.data;
      } catch { /* non-fatal */ }

      const res = await fetch("/api/deal-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_address: newAddress,
          property_data,
          target_close_date: newCloseDate || null,
        }),
      });
      const data = await res.json();
      if (data.room?.id) {
        router.push(`/deal-rooms/${data.room.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const activeRooms  = rooms.filter((r) => r.status !== "closed" && r.status !== "cancelled");
  const closedRooms  = rooms.filter((r) => r.status === "closed" || r.status === "cancelled");

  return (
    <div style={{ background: "#080c12", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#f0f4ff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .dr-card { background: #0e1420; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 20px; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
        .dr-card:hover { border-color: rgba(255,255,255,0.15); transform: translateY(-1px); }
        .dr-btn-primary { background: #00e87a; color: #080c12; border: none; border-radius: 8px; padding: 12px 20px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .dr-btn-primary:hover { background: #00c96a; }
        .dr-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .dr-btn-ghost { background: transparent; color: #6b7a99; border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; padding: 10px 16px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .dr-btn-ghost:hover { border-color: rgba(255,255,255,0.15); color: #f0f4ff; }
        .dr-input { background: #141b28; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #f0f4ff; font-size: 14px; padding: 12px 14px; width: 100%; outline: none; font-family: inherit; }
        .dr-input:focus { border-color: #00e87a; }
        .dr-input::placeholder { color: #3a4560; }
        .dr-label { font-size: 12px; color: #6b7a99; text-transform: uppercase; letter-spacing: 0.06em; font-family: 'DM Sans', sans-serif; font-weight: 500; margin-bottom: 6px; display: block; }
        .dr-section-title { font-size: 11px; color: #3a4560; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; font-weight: 500; }
        .member-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .new-panel { background: #0e1420; border: 1px solid rgba(0,232,122,0.2); border-radius: 12px; padding: 24px; margin-bottom: 32px; }
      `}</style>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700, color: "#f0f4ff" }}>
              Deal Rooms
            </h1>
            <p style={{ fontSize: 14, color: "#6b7a99", marginTop: 4 }}>
              AI-powered transaction workspace for every deal
            </p>
          </div>
          {!showNew && (
            <button className="dr-btn-primary" onClick={() => setShowNew(true)}>
              + New Room
            </button>
          )}
        </div>

        {/* New room panel */}
        {showNew && (
          <div className="new-panel">
            <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 20, color: "#f0f4ff" }}>New Deal Room</p>
            <div style={{ marginBottom: 16 }}>
              <span className="dr-label">Property Address</span>
              <AddressAutocomplete
                value={newAddress}
                onChange={setNewAddress}
                placeholder="Start typing an address…"
                className="dr-input"
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <span className="dr-label">Target Close Date (optional)</span>
              <input
                type="date"
                className="dr-input"
                value={newCloseDate}
                onChange={(e) => setNewCloseDate(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="dr-btn-primary"
                onClick={createRoom}
                disabled={submitting || !newAddress.trim()}
              >
                {submitting ? "Creating…" : "Create Room"}
              </button>
              <button className="dr-btn-ghost" onClick={() => { setShowNew(false); setNewAddress(""); setNewCloseDate(""); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", color: "#6b7a99", fontSize: 14, padding: "60px 0" }}>
            Loading your rooms…
          </div>
        )}

        {/* Empty */}
        {!loading && rooms.length === 0 && !showNew && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>🏠</div>
            <p style={{ fontSize: 16, fontWeight: 500, color: "#f0f4ff", marginBottom: 8 }}>
              No deal rooms yet
            </p>
            <p style={{ fontSize: 14, color: "#6b7a99", marginBottom: 24 }}>
              Create a room for a property and invite your buyer, agent, or loan officer.
            </p>
            <button className="dr-btn-primary" onClick={() => setShowNew(true)}>
              Create Your First Room
            </button>
          </div>
        )}

        {/* Active rooms */}
        {!loading && activeRooms.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <p className="dr-section-title">Active</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeRooms.map((room) => (
                <RoomCard key={room.id} room={room} onClick={() => router.push(`/deal-rooms/${room.id}`)} />
              ))}
            </div>
          </div>
        )}

        {/* Closed rooms */}
        {!loading && closedRooms.length > 0 && (
          <div>
            <p className="dr-section-title">Closed / Cancelled</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {closedRooms.map((room) => (
                <RoomCard key={room.id} room={room} onClick={() => router.push(`/deal-rooms/${room.id}`)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoomCard({ room, onClick }: { room: Room; onClick: () => void }) {
  const color = STATUS_COLOR[room.status] ?? "#6b7a99";
  const joined  = room.members.filter((m) => m.joined_at).length;
  const total   = room.members.length;

  return (
    <div className="dr-card" onClick={onClick}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: "#f0f4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {room.property_address}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "#6b7a99" }}>
              {joined}/{total} member{total !== 1 ? "s" : ""}
            </span>
            {room.offer_price && (
              <span style={{ fontSize: 12, color: "#6b7a99" }}>
                ${(room.offer_price / 1000).toFixed(0)}k offer
              </span>
            )}
            {room.target_close_date && (
              <span style={{ fontSize: 12, color: "#6b7a99" }}>
                Close {new Date(room.target_close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
          background: `${color}18`, color, border: `1px solid ${color}40`,
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {STATUS_LABELS[room.status] ?? room.status}
        </span>
      </div>
    </div>
  );
}
