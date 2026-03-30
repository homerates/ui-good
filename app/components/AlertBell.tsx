"use client";
// AlertBell — shows in the chat header, badge count, dropdown to manage alerts

import React, { useEffect, useRef, useState } from "react";

interface Alert {
  id: string;
  type: "rate" | "refi" | "property";
  label: string;
  active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

const TYPE_ICON: Record<string, string> = {
  rate: "📉",
  refi: "♻️",
  property: "🏠",
};

export default function AlertBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const j = await res.json();
        setAlerts(j.alerts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function removeAlert(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="hr-alert-bell-wrap" ref={ref}>
      <button
        className="hr-alert-bell-btn"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        title="Alerts"
        aria-label="Manage alerts"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {alerts.length > 0 && (
          <span className="hr-alert-bell-badge">{alerts.length}</span>
        )}
      </button>

      {open && (
        <div className="hr-alert-dropdown">
          <div className="hr-alert-dropdown-header">
            <span>Active Alerts</span>
            <span className="hr-alert-dropdown-count">{alerts.length}</span>
          </div>

          {loading && <div className="hr-alert-dropdown-empty">Loading…</div>}

          {!loading && alerts.length === 0 && (
            <div className="hr-alert-dropdown-empty">
              No alerts yet.<br />
              <span style={{ opacity: 0.6, fontSize: "11px" }}>Ask about rates, refi or a property to set one up.</span>
            </div>
          )}

          {alerts.map((a) => (
            <div key={a.id} className="hr-alert-dropdown-item">
              <span className="hr-alert-dropdown-icon">{TYPE_ICON[a.type] ?? "🔔"}</span>
              <div className="hr-alert-dropdown-info">
                <div className="hr-alert-dropdown-label">{a.label}</div>
                {a.last_triggered_at ? (
                  <div className="hr-alert-dropdown-meta">
                    Last fired: {new Date(a.last_triggered_at).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="hr-alert-dropdown-meta">Watching…</div>
                )}
              </div>
              <button
                className="hr-alert-dropdown-remove"
                onClick={() => removeAlert(a.id)}
                title="Remove alert"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
