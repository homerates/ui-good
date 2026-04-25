// app/hooks/useUnreadMessages.ts
// Polls /api/messages/unread every 30s to surface unread message count.
// Returns 0 when not signed in or on error — never throws.

"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

export function useUnreadMessages(): number {
  const { isLoaded, isSignedIn } = useAuth();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    async function poll() {
      try {
        const [msgRes, drRes] = await Promise.all([
          fetch("/api/messages/unread"),
          fetch("/api/deal-rooms/unread"),
        ]);
        const msgData = msgRes.ok ? await msgRes.json() : { total: 0 };
        const drData  = drRes.ok  ? await drRes.json()  : { total: 0 };
        setTotal((msgData.total ?? 0) + (drData.total ?? 0));
      } catch { /* ignore */ }
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [isLoaded, isSignedIn]);

  return total;
}
