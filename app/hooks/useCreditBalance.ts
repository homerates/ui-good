"use client";
// app/hooks/useCreditBalance.ts
// Fetches current user's credit balance once on mount.

import { useState, useEffect } from "react";

interface CreditData {
  balance: number;
  earned_this_month: number;
}

export function useCreditBalance(): CreditData | null {
  const [data, setData] = useState<CreditData | null>(null);

  useEffect(() => {
    fetch("/api/credits")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d && typeof d.balance === "number") {
          setData({ balance: d.balance, earned_this_month: d.earned_this_month ?? 0 });
        }
      })
      .catch(() => {});
  }, []);

  return data;
}
