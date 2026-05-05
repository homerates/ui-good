"use client";
// app/admin/outreach/page.tsx
// Drop-zone admin tool — upload Name & Email CSV → adds to Loops + fires 1-2-3 outreach email

import { useState, useCallback, useRef, DragEvent, ChangeEvent } from "react";
import Link from "next/link";
import AppNav from "../../components/AppNav";
import { useAdminStatus } from "../../hooks/useAdminStatus";

type Contact = { name: string; email: string };
type ImportResult = { added: number; failed: number; errors: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCSV(text: string): { contacts: Contact[]; parseErrors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const contacts: Contact[] = [];
  const parseErrors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip obvious header rows
    if (i === 0 && /^(name|full.?name|first)/i.test(line)) continue;

    // Support comma, tab, or space-separated "Name Email" / "Email Name"
    let name = "";
    let email = "";
    const emailMatch = line.match(/\S+@\S+\.\S+/);
    if (emailMatch) {
      email = emailMatch[0].replace(/^"|"$/g, "").trim().toLowerCase();
      name = line.replace(emailMatch[0], "").replace(/^[,\t\s]+|[,\t\s]+$/g, "").replace(/^"|"$/g, "").trim();
    } else if (line.includes("\t")) {
      const parts = line.split("\t");
      name = (parts[0] ?? "").replace(/^"|"$/g, "").trim();
      email = (parts[1] ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
    } else if (line.includes(",")) {
      const parts = line.split(",");
      name = (parts[0] ?? "").replace(/^"|"$/g, "").trim();
      email = (parts[1] ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
    }

    // Only flag as error if the line contains @ (i.e. user intended an email)
    if (!email || !EMAIL_RE.test(email)) {
      if (line.includes("@")) parseErrors.push(`Row ${i + 1}: invalid email "${email}"`);
      continue;
    }
    if (!name) {
      parseErrors.push(`Row ${i + 1}: missing name for ${email}`);
      continue;
    }
    contacts.push({ name, email });
  }

  return { contacts, parseErrors };
}

const LO_QUESTIONS = [
  { label: "Purchase — $500k conventional, 10% down", sq: "Conventional loan on a $500,000 home with 10% down — show me the full payment breakdown including PMI." },
  { label: "Jumbo — $1.5M, 20% down", sq: "Jumbo loan on a $1,500,000 home with 20% down — show me the full payment breakdown and reserve requirements." },
  { label: "Affordability — $120k income, $42k saved", sq: "I make $120,000 a year and have $42,000 saved — how much house can I afford?" },
];

const CONSUMER_QUESTIONS = [
  { label: "What can I afford with my income?", sq: "Based on my income, what home price can I afford and what would my monthly payment look like?" },
  { label: "Should I buy now or wait for rates to drop?", sq: "Should I buy a home now or wait for mortgage rates to drop?" },
  { label: "What would my payment be on a $500k home?", sq: "What would my monthly payment be on a $500,000 home with 10% down?" },
];

export default function AdminOutreachPage() {
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  const [audience, setAudience] = useState<"lo" | "consumer">("lo");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [raw, setRaw] = useState("");
  const [dragging, setDragging] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyText = useCallback((text: string) => {
    setRaw(text);
    setResult(null);
    const { contacts: parsed, parseErrors: errs } = parseCSV(text);
    setContacts(parsed);
    setParseErrors(errs);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => applyText((ev.target?.result as string) ?? "");
      reader.readAsText(file);
    },
    [applyText]
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => applyText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  async function handleSend() {
    if (contacts.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/loops-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, audience }),
      });
      const data: ImportResult = await res.json();
      setResult(data);
    } catch {
      setResult({ added: 0, failed: contacts.length, errors: ["Network error — check console"] });
    } finally {
      setSending(false);
    }
  }

  const questions = audience === "lo" ? LO_QUESTIONS : CONSUMER_QUESTIONS;

  if (adminLoading) return null;
  if (!isAdmin)
    return (
      <div style={{ color: "#fff", padding: "2rem" }}>
        <AppNav />
        <p>Admin access required.</p>
      </div>
    );

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#0a0a0a", color: "#fff", overflowY: "auto" }}>
      <AppNav />
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1.5rem", boxSizing: "border-box" }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: "1.5rem" }}>
          <Link href="/admin" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>
            ← Admin
          </Link>
        </div>

        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          Outreach Import
        </h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: "2rem" }}>
          Upload a CSV of Name &amp; Email → contacts are added to Loops and receive the outreach email instantly via Resend.
        </p>

        {/* Audience toggle */}
        <div style={{ marginBottom: "1.75rem" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Audience
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {(["lo", "consumer"] as const).map((a) => (
              <button
                key={a}
                onClick={() => { setAudience(a); setResult(null); }}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  background: audience === a ? "#00e87a" : "rgba(255,255,255,0.07)",
                  color: audience === a ? "#000" : "rgba(255,255,255,0.6)",
                  transition: "all 0.15s",
                }}
              >
                {a === "lo" ? "Loan Officers / Brokers" : "Consumers / Buyers"}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "#00e87a" : "rgba(255,255,255,0.15)"}`,
            borderRadius: 12,
            padding: "2rem",
            textAlign: "center",
            cursor: "pointer",
            marginBottom: "1.25rem",
            background: dragging ? "rgba(0,232,122,0.04)" : "rgba(255,255,255,0.02)",
            transition: "all 0.15s",
          }}
        >
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={onFileChange} />
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: 0 }}>
            Drag &amp; drop a CSV file here, or <span style={{ color: "#00e87a" }}>click to browse</span>
          </p>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: "4px 0 0" }}>
            Format: <code style={{ color: "rgba(255,255,255,0.45)" }}>Name, Email</code> — one per row, header row auto-skipped
          </p>
        </div>

        {/* OR — manual paste */}
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: "0.4rem" }}>
            Or paste directly:
          </p>
          <textarea
            value={raw}
            onChange={(e) => applyText(e.target.value)}
            placeholder={"John Smith, john@example.com\nJane Doe, jane@brokerage.com"}
            rows={5}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              padding: "10px 12px",
              resize: "vertical",
              fontFamily: "monospace",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Parse errors */}
        {parseErrors.length > 0 && (
          <div style={{ background: "rgba(255,95,95,0.08)", border: "1px solid rgba(255,95,95,0.2)", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem" }}>
            <p style={{ color: "#ff5f5f", fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>Parse issues ({parseErrors.length})</p>
            {parseErrors.map((e, i) => (
              <p key={i} style={{ color: "rgba(255,95,95,0.8)", fontSize: 12, margin: "2px 0" }}>{e}</p>
            ))}
          </div>
        )}

        {/* Preview table */}
        {contacts.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: "0.5rem" }}>
              {contacts.length} contact{contacts.length !== 1 ? "s" : ""} ready
            </p>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>#</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>Name</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 50).map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "7px 12px", color: "rgba(255,255,255,0.25)" }}>{i + 1}</td>
                      <td style={{ padding: "7px 12px", color: "rgba(255,255,255,0.8)" }}>{c.name}</td>
                      <td style={{ padding: "7px 12px", color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>{c.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contacts.length > 50 && (
                <p style={{ padding: "8px 12px", fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>
                  +{contacts.length - 50} more not shown
                </p>
              )}
            </div>
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={contacts.length === 0 || sending}
          style={{
            padding: "12px 28px",
            borderRadius: 10,
            border: "none",
            cursor: contacts.length === 0 || sending ? "not-allowed" : "pointer",
            fontSize: 15,
            fontWeight: 700,
            background: contacts.length === 0 || sending ? "rgba(255,255,255,0.08)" : "#00e87a",
            color: contacts.length === 0 || sending ? "rgba(255,255,255,0.3)" : "#000",
            transition: "all 0.15s",
            marginBottom: "2rem",
          }}
        >
          {sending
            ? `Sending ${contacts.length} contact${contacts.length !== 1 ? "s" : ""}…`
            : `Send Outreach Email (${contacts.length})`}
        </button>

        {/* Result */}
        {result && (
          <div style={{
            background: result.failed === 0 ? "rgba(0,232,122,0.07)" : "rgba(217,119,6,0.08)",
            border: `1px solid ${result.failed === 0 ? "rgba(0,232,122,0.2)" : "rgba(217,119,6,0.25)"}`,
            borderRadius: 10,
            padding: "1rem 1.25rem",
            marginBottom: "2rem",
          }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 6px", color: result.failed === 0 ? "#00e87a" : "#d97706" }}>
              {result.added} added · {result.failed} failed
            </p>
            {result.errors.length > 0 && result.errors.map((e, i) => (
              <p key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "3px 0", fontFamily: "monospace" }}>{e}</p>
            ))}
          </div>
        )}

        {/* Email preview */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 12,
          padding: "1.5rem",
        }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 0.75rem" }}>
            Email template preview — {audience === "lo" ? "Loan Officer / Broker" : "Consumer / Buyer"}
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 0.5rem" }}>
            <strong style={{ color: "rgba(255,255,255,0.85)" }}>Subject:</strong>{" "}
            {audience === "lo" ? "3 questions your borrowers are asking right now" : "3 things homebuyers are wondering right now"}
          </p>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0.75rem 0" }} />
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "0 0 0.75rem" }}>
            {audience === "lo"
              ? "Here are 3 questions your borrowers are asking — click any to get an AI answer in seconds:"
              : "Here are 3 questions homebuyers like you are asking right now — click any for an instant answer:"}
          </p>
          {questions.map((q, i) => (
            <div key={i} style={{ marginBottom: "0.5rem" }}>
              <span style={{ color: "#00e87a", fontWeight: 700, marginRight: 8 }}>{i + 1}.</span>
              <a
                href={`https://chat.homerates.ai/chat?sq=${encodeURIComponent(q.sq)}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, textDecoration: "underline" }}
              >
                {q.label}
              </a>
            </div>
          ))}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0.75rem 0" }} />
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0 }}>
            Emails are sent via Resend. Contacts are also added to Loops CRM.
          </p>
        </div>
      </div>
    </div>
  );
}
