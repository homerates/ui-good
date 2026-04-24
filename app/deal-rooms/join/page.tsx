"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

export default function JoinDealRoomPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = React.useState<"loading"|"joining"|"error"|"done">("loading");
  const [errorMsg, setErrorMsg] = React.useState("");

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      // Preserve token through sign-in redirect
      router.replace(`/sign-in?redirect_url=/deal-rooms/join?token=${token}`);
      return;
    }
    if (!token) { setStatus("error"); setErrorMsg("Invalid invite link — no token found."); return; }
    setStatus("joining");
    join();
  }, [isLoaded, isSignedIn]);

  async function join() {
    const res = await fetch("/api/deal-rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const d = await res.json();
    if (!res.ok) { setStatus("error"); setErrorMsg(d.error ?? "Could not join room."); return; }
    setStatus("done");
    setTimeout(() => router.replace(`/deal-rooms/${d.deal_room_id}`), 1200);
  }

  return (
    <div style={{
      background: "#080c12", minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif", color: "#f0f4ff", padding: 24,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500&display=swap');`}</style>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        {(status === "loading" || status === "joining") && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>🏠</div>
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Joining Deal Room
            </p>
            <p style={{ fontSize: 14, color: "#6b7a99" }}>
              {status === "loading" ? "Verifying your invite…" : "Setting up your access…"}
            </p>
          </>
        )}
        {status === "done" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#00e87a" }}>
              You&apos;re in
            </p>
            <p style={{ fontSize: 14, color: "#6b7a99" }}>Redirecting to the room…</p>
          </>
        )}
        {status === "error" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✕</div>
            <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#ff5f5f" }}>
              Invite Error
            </p>
            <p style={{ fontSize: 14, color: "#6b7a99", marginBottom: 24 }}>{errorMsg}</p>
            <button
              onClick={() => router.replace("/deal-rooms")}
              style={{
                background: "#00e87a", color: "#080c12", border: "none",
                borderRadius: 8, padding: "10px 20px", fontSize: 14,
                fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Go to Deal Rooms
            </button>
          </>
        )}
      </div>
    </div>
  );
}
