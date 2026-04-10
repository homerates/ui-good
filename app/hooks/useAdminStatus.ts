"use client";
// app/hooks/useAdminStatus.ts
// Returns admin status for the currently-signed-in user.
// Fetches from /api/admin/check once per component mount; result is cached
// at module level for the browser session (cleared on page reload).

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

// Module-level cache — avoids re-fetching on every component that uses this hook
let sessionCache: { userId: string; isAdmin: boolean } | null = null;

export function useAdminStatus(): { isAdmin: boolean; loading: boolean } {
  const { user, isLoaded } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) { setIsAdmin(false); setLoading(false); return; }

    // Return cached result if it's for the same user
    if (sessionCache && sessionCache.userId === user.id) {
      setIsAdmin(sessionCache.isAdmin);
      setLoading(false);
      return;
    }

    fetch("/api/admin/check")
      .then(r => r.json())
      .then(d => {
        const result = !!d.isAdmin;
        sessionCache = { userId: user.id, isAdmin: result };
        setIsAdmin(result);
      })
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, [isLoaded, user?.id]);

  return { isAdmin, loading };
}
