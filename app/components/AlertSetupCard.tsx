"use client";
// AlertSetupCard — appears in chat after relevant responses (refi, property, rates)
// type: 'rate' | 'refi' | 'property'

import React, { useState } from "react";
import { useUser } from "@clerk/nextjs";

interface AlertSetupCardProps {
  type: "rate" | "refi" | "property";
  // Prefill context from the triggering card
  prefill?: {
    address?: string;
    propertyValue?: number;
    currentRate?: number;
    balance?: number;
    rateThreshold?: number;
  };
  onCreated?: () => void;
}

const TYPE_META = {
  rate: {
    icon: "📉",
    title: "Rate Drop Alert",
    desc: "Get notified when 30Y fixed rates hit your target.",
  },
  refi: {
    icon: "♻️",
    title: "Refi Opportunity Alert",
    desc: "We'll tell you when refinancing saves your monthly target.",
  },
  property: {
    icon: "🏠",
    title: "Property Value Alert",
    desc: "We'll watch this property and alert you when the value shifts ≥3%.",
  },
};

export default function AlertSetupCard({ type, prefill, onCreated }: AlertSetupCardProps) {
  const { user } = useUser();
  const meta = TYPE_META[type];

  const [email, setEmail] = useState(
    user?.primaryEmailAddress?.emailAddress ?? ""
  );
  const [threshold, setThreshold] = useState(
    prefill?.rateThreshold?.toString() ?? prefill?.currentRate ? (prefill.currentRate! - 0.5).toFixed(2) : "6.25"
  );
  const [balance, setBalance] = useState(prefill?.balance?.toString() ?? "");
  const [savingsTarget, setSavingsTarget] = useState("150");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSaving(true);
    setError("");

    let params: Record<string, unknown> = {};
    let label = "";

    if (type === "rate") {
      params = { threshold: parseFloat(threshold), direction: "below" };
      label = `Rate Alert: 30Y below ${threshold}%`;
    } else if (type === "refi") {
      params = {
        currentRate: prefill?.currentRate ?? parseFloat(threshold),
        balance: parseFloat(balance),
        targetMonthlySavings: parseFloat(savingsTarget),
      };
      label = `Refi Alert: save $${savingsTarget}/mo on $${balance}`;
    } else if (type === "property") {
      params = {
        address: prefill?.address ?? "",
        lastValue: prefill?.propertyValue ?? 0,
      };
      label = `Property Alert: ${prefill?.address ?? "your property"}`;
    }

    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, label, params, email }),
    });

    if (res.ok) {
      setDone(true);
      onCreated?.();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not create alert. Please try again.");
    }
    setSaving(false);
  }

  if (done) {
    return (
      <div className="hr-alert-card hr-alert-card--done">
        <span className="hr-alert-card-icon">✓</span>
        <div>
          <div className="hr-alert-card-title">Alert set!</div>
          <div className="hr-alert-card-sub">We'll email {email} when conditions are met.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="hr-alert-card">
      <div className="hr-alert-card-header">
        <span className="hr-alert-card-icon">{meta.icon}</span>
        <div>
          <div className="hr-alert-card-title">{meta.title}</div>
          <div className="hr-alert-card-sub">{meta.desc}</div>
        </div>
      </div>

      <form className="hr-alert-card-form" onSubmit={handleSubmit}>
        {/* Email */}
        <label className="hr-alert-label">
          Notify email
          <input
            type="email"
            className="hr-alert-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </label>

        {/* Rate-specific */}
        {type === "rate" && (
          <label className="hr-alert-label">
            Alert me when 30Y drops below
            <div className="hr-alert-input-row">
              <input
                type="number"
                step="0.125"
                min="3"
                max="10"
                className="hr-alert-input"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                required
              />
              <span className="hr-alert-unit">%</span>
            </div>
          </label>
        )}

        {/* Refi-specific */}
        {type === "refi" && (
          <>
            <label className="hr-alert-label">
              Current loan balance
              <div className="hr-alert-input-row">
                <span className="hr-alert-unit">$</span>
                <input
                  type="number"
                  className="hr-alert-input"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="350000"
                  required
                />
              </div>
            </label>
            <label className="hr-alert-label">
              Alert me when monthly savings reach
              <div className="hr-alert-input-row">
                <span className="hr-alert-unit">$</span>
                <input
                  type="number"
                  className="hr-alert-input"
                  value={savingsTarget}
                  onChange={(e) => setSavingsTarget(e.target.value)}
                  placeholder="150"
                  required
                />
                <span className="hr-alert-unit">/mo</span>
              </div>
            </label>
          </>
        )}

        {/* Property-specific — address is prefilled, just confirm */}
        {type === "property" && prefill?.address && (
          <div className="hr-alert-property-badge">
            <span className="hr-alert-unit">📍</span>
            {prefill.address}
          </div>
        )}

        {error && <div className="hr-alert-error">{error}</div>}

        <button
          type="submit"
          className="hr-alert-submit"
          disabled={saving}
        >
          {saving ? "Setting up…" : "Set Alert"}
        </button>
      </form>
    </div>
  );
}
