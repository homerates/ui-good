"use client";

// app/activity/page.tsx
// Standalone home for the "Welcome Home" personalization experience
// (WelcomeHome + /api/consumer-memory + lib/crm/consumer-memory.ts).
//
// Extracted out of /my-home 2026-07-29: this was never a my-home-specific
// feature that happened to live there — it's shared personalization
// infrastructure that also powers consumer-mode chat context (see
// lib/crm/consumer-memory.ts's own header comment). Giving it a real,
// top-level page matches what it actually is: its own surface, not a
// section of My Home.
//
// Decision 10 note (unchanged from my-home): this is the consumer's own
// activity, rendered only to them. No borrowerId/LO-view concept here at all.

import { useEffect, useState, Suspense } from "react";
import { useUser } from "@clerk/nextjs";
import PageShell from "../components/PageShell";
import WelcomeHome, { type WelcomeHomeProperty } from "../components/WelcomeHome";
import type { ConsumerActivityEvent, ConsumerLastAction, ConsumerNextStep } from "../../lib/crm/consumer-memory";

interface HomeownerPropertyRow {
  id: string;
  property_address: string;
  is_primary: boolean;
}

function ActivityPageInner() {
  const { user, isLoaded } = useUser();

  const [properties, setProperties] = useState<WelcomeHomeProperty[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [memory, setMemory] = useState<{
    summaryText: string;
    nextSteps:   ConsumerNextStep[];
    lastAction:  ConsumerLastAction | null;
    events:      ConsumerActivityEvent[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Property list — same source as My Home's "thumb index"/property switcher.
  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch("/api/homeowner/save")
      .then(r => r.json())
      .then(({ properties: props }: { properties: HomeownerPropertyRow[] }) => {
        const list = props ?? [];
        setProperties(list);
        const primary = list.find(p => p.is_primary) ?? list[0];
        if (primary) setActivePropertyId(primary.id);
      })
      .finally(() => setLoading(false));
  }, [isLoaded, user]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch("/api/consumer-memory")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.hasActivity) {
          setMemory({
            summaryText: d.summaryText ?? "",
            nextSteps:   Array.isArray(d.nextSteps) ? d.nextSteps : [],
            lastAction:  d.lastAction ?? null,
            events:      Array.isArray(d.events) ? d.events : [],
          });
        }
      })
      .catch(() => {});
  }, [isLoaded, user]);

  // Selecting a property here means "go look at it" — full analysis lives on
  // My Home, this page is a summary/nav surface, not a duplicate of it.
  function goToProperty(id: string) {
    window.location.href = `/my-home?property=${encodeURIComponent(id)}`;
  }

  return (
    <PageShell backHref="/my-home" backLabel="My Home" maxWidth={900}>
      {loading || !memory ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(185,208,192,0.6)" }}>
          {loading ? "Loading your activity…" : "Nothing here yet — head to My Home or Chat to get started."}
        </div>
      ) : (
        <WelcomeHome
          firstName={user?.firstName ?? null}
          summaryText={memory.summaryText}
          lastAction={memory.lastAction}
          nextSteps={memory.nextSteps}
          events={memory.events}
          properties={properties}
          activePropertyId={activePropertyId}
          photoCache={{}}
          onSelectProperty={goToProperty}
        />
      )}
    </PageShell>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityPageInner />
    </Suspense>
  );
}
