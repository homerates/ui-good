"use client";
// app/lo/borrowers/page.tsx

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import PageShell from "../../components/PageShell";

type Borrower = {
    id: string;
    name: string;
    email: string | null;
    user_id: string | null;
    property_address: string | null;
    digest_enabled: boolean;
    created_at: string;
};

export default function LoBorrowersPage() {
    const { isLoaded, isSignedIn } = useAuth();
    const router = useRouter();
    const [borrowers, setBorrowers] = React.useState<Borrower[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [creating, setCreating] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
    const [inviteCode, setInviteCode] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);
    // Per-borrower editing state
    const [editing, setEditing] = React.useState<Record<string, string>>({});
    const [saving, setSaving] = React.useState<string | null>(null);
    const [sending, setSending] = React.useState<string | null>(null);
    const [sentOk, setSentOk] = React.useState<string | null>(null);
    // Gift credits state
    const [loBalance, setLoBalance] = React.useState<number | null>(null);
    const [giftOpen, setGiftOpen] = React.useState<string | null>(null);    // borrower id with open gift panel
    const [giftAmount, setGiftAmount] = React.useState<Record<string, string>>({});
    const [gifting, setGifting] = React.useState<string | null>(null);
    const [giftOk, setGiftOk] = React.useState<string | null>(null);
    const [giftErr, setGiftErr] = React.useState<string | null>(null);
    const [deleting, setDeleting] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.replace("/sign-in?redirect_url=" + encodeURIComponent("/lo/borrowers"));
        }
    }, [isLoaded, isSignedIn, router]);

    React.useEffect(() => {
        fetch("/api/borrowers")
            .then(r => r.json())
            .then(d => { setBorrowers(d.borrowers ?? []); setLoading(false); })
            .catch(() => setLoading(false));
        fetch("/api/credits")
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.balance !== undefined) setLoBalance(d.balance); })
            .catch(() => {});
    }, []);

    async function handleCreateInvite() {
        setError(null);
        setCopied(false);
        setCreating(true);
        try {
            const res = await fetch("/api/lo/invites", { method: "POST" });
            const data = await res.json().catch(() => null);
            if (!res.ok) { setError(data?.error || "Unable to create invite."); }
            else { setInviteUrl(data.inviteUrl || null); setInviteCode(data.code || null); }
        } catch { setError("Unexpected error. Please try again."); }
        setCreating(false);
    }

    async function handleCopy() {
        if (!inviteUrl) return;
        try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
        catch { setError("Could not copy to clipboard."); }
    }

    async function saveAddress(borrower: Borrower) {
        const address = editing[borrower.id] ?? borrower.property_address ?? '';
        setSaving(borrower.id);
        const res = await fetch("/api/borrowers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: borrower.id, property_address: address }),
        });
        const data = await res.json();
        if (data.borrower) {
            setBorrowers(prev => prev.map(b => b.id === borrower.id ? { ...b, property_address: address } : b));
            const { [borrower.id]: _, ...rest } = editing;
            setEditing(rest);
        }
        setSaving(null);
    }

    async function giftCredits(borrower: Borrower) {
        const raw = giftAmount[borrower.id] ?? "";
        const amount = parseInt(raw, 10);
        if (!amount || amount < 10) return;
        setGifting(borrower.id);
        setGiftErr(null);
        setGiftOk(null);
        const res = await fetch("/api/lo/gift-credits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ borrowerId: borrower.id, amount }),
        });
        const d = await res.json();
        setGifting(null);
        if (!res.ok) {
            setGiftErr(d.error ?? "Failed to gift credits");
        } else {
            setGiftOk(borrower.id);
            if (d.newLoBalance !== undefined) setLoBalance(d.newLoBalance);
            setGiftAmount(prev => ({ ...prev, [borrower.id]: "" }));
            setTimeout(() => { setGiftOk(null); setGiftOpen(null); }, 2500);
        }
    }

    async function deleteBorrower(borrower: Borrower) {
        if (!confirm(`Remove ${borrower.name} from your list? This cannot be undone.`)) return;
        setDeleting(borrower.id);
        const res = await fetch(`/api/borrowers?id=${borrower.id}`, { method: "DELETE" });
        if (res.ok) {
            setBorrowers(prev => prev.filter(b => b.id !== borrower.id));
        } else {
            const d = await res.json().catch(() => ({}));
            setError(d.error ?? "Failed to remove borrower");
        }
        setDeleting(null);
    }

    async function sendDigest(borrower: Borrower) {
        if (!borrower.property_address) return;
        setSending(borrower.id);
        setSentOk(null);
        const res = await fetch("/api/digest/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ borrower_id: borrower.id }),
        });
        const data = await res.json();
        setSending(null);
        if (data.ok) { setSentOk(borrower.id); setTimeout(() => setSentOk(null), 3000); }
        else { setError(data.error ?? "Failed to send digest."); }
    }

    return (
        <PageShell backHref="/lo/dashboard" backLabel="LO Portal" maxWidth={900}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 4px", color: "#f1f5f9" }}>Borrowers</h1>
                    <p style={{ margin: 0, fontSize: "0.88rem", color: "rgba(185,208,192,0.7)" }}>
                        Manage borrowers, set their property address, and send monthly home digests.
                    </p>
                    {loBalance !== null && (
                        <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "rgba(0,232,122,0.7)" }}>
                            Your credit balance: <strong style={{ color: "#00e87a" }}>{loBalance.toLocaleString()}</strong>
                        </p>
                    )}
                </div>
                <button type="button" onClick={handleCreateInvite} disabled={creating} style={{
                    padding: "9px 18px", borderRadius: 999, border: "none",
                    background: creating ? "rgba(0,232,122,0.3)" : "#00e87a",
                    color: creating ? "rgba(8,12,18,0.5)" : "#080c12",
                    fontSize: "0.88rem", fontWeight: 600, cursor: creating ? "default" : "pointer", whiteSpace: "nowrap",
                }}>
                    {creating ? "Creating…" : "+ Invite Borrower"}
                </button>
            </div>

            {/* Invite result */}
            {(inviteUrl || error) && (
                <section style={{
                    padding: "14px 16px", borderRadius: 12, marginBottom: 24,
                    border: error && !inviteUrl ? "1px solid rgba(248,113,113,0.25)" : "1px solid rgba(0,232,122,0.2)",
                    background: error && !inviteUrl ? "rgba(248,113,113,0.05)" : "rgba(0,232,122,0.03)",
                    display: "grid", gap: 8,
                }}>
                    {error && <p style={{ fontSize: "0.85rem", color: "#f87171", margin: 0 }}>{error}</p>}
                    {inviteUrl && (
                        <>
                            <p style={{ fontSize: "0.85rem", color: "#e2e8f0", margin: 0, fontWeight: 500 }}>Send this link to your borrower:</p>
                            {inviteCode && <p style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.5)", margin: 0 }}>
                                Code: <span style={{ fontFamily: "monospace", color: "#00e87a" }}>{inviteCode}</span>
                            </p>}
                            <div style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", fontSize: "0.78rem", color: "#94a3b8", wordBreak: "break-all", background: "rgba(255,255,255,0.03)", fontFamily: "monospace" }}>{inviteUrl}</div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <button type="button" onClick={handleCopy} style={{ padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(0,232,122,0.4)", background: copied ? "rgba(0,232,122,0.15)" : "transparent", color: "#00e87a", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer" }}>
                                    {copied ? "Copied ✓" : "Copy link"}
                                </button>
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* Borrower list */}
            {loading ? (
                <p style={{ color: "rgba(185,208,192,0.5)", fontSize: "0.88rem" }}>Loading borrowers…</p>
            ) : borrowers.length === 0 ? (
                <div style={{ padding: "40px 24px", borderRadius: 14, border: "1px dashed rgba(148,163,184,0.15)", textAlign: "center" }}>
                    <p style={{ color: "rgba(185,208,192,0.5)", margin: "0 0 8px" }}>No borrowers yet.</p>
                    <p style={{ color: "rgba(185,208,192,0.35)", fontSize: "0.82rem", margin: 0 }}>Invite a borrower using the button above.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {borrowers.map(b => {
                        const isSaving  = saving  === b.id;
                        const isSending = sending === b.id;
                        const didSend   = sentOk  === b.id;
                        const editVal   = editing[b.id] ?? b.property_address ?? '';
                        const isDirty   = b.id in editing && editing[b.id] !== (b.property_address ?? '');

                        const isGifting  = gifting  === b.id;
                        const didGift    = giftOk   === b.id;
                        const isGiftOpen = giftOpen === b.id;

                        return (
                            <div key={b.id} style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.1)", background: "rgba(255,255,255,0.025)", display: "flex", flexDirection: "column", gap: 12 }}>
                                {/* Top row — name + email */}
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#e0f0e8" }}>{b.name}</div>
                                        {b.email && <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.5)", marginTop: 2 }}>{b.email}</div>}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        {/* Gift credits button — only if borrower has signed up */}
                                        <button
                                            type="button"
                                            onClick={() => { setGiftOpen(isGiftOpen ? null : b.id); setGiftErr(null); setGiftOk(null); }}
                                            title={!b.user_id ? "Borrower hasn't signed up yet" : undefined}
                                            style={{
                                                padding: "6px 14px", borderRadius: 999,
                                                border: "1px solid rgba(148,163,184,0.2)",
                                                background: isGiftOpen ? "rgba(255,255,255,0.06)" : "transparent",
                                                color: b.user_id ? "rgba(185,208,192,0.6)" : "rgba(185,208,192,0.25)",
                                                fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                                            }}
                                        >
                                            {didGift ? "Gifted ✓" : "Gift Credits"}
                                        </button>
                                        {/* Delete borrower */}
                                        <button
                                            type="button"
                                            onClick={() => deleteBorrower(b)}
                                            disabled={deleting === b.id}
                                            title="Remove from your list"
                                            style={{
                                                padding: "6px 14px", borderRadius: 999,
                                                border: "1px solid rgba(248,113,113,0.2)",
                                                background: "transparent",
                                                color: "rgba(248,113,113,0.5)",
                                                fontSize: "0.78rem", fontWeight: 600,
                                                cursor: deleting === b.id ? "default" : "pointer",
                                                whiteSpace: "nowrap", opacity: deleting === b.id ? 0.4 : 1,
                                            }}
                                        >
                                            {deleting === b.id ? "Removing…" : "Remove"}
                                        </button>
                                        {/* Send digest button */}
                                        <button
                                            type="button"
                                            onClick={() => sendDigest(b)}
                                            disabled={isSending || !b.property_address || didSend}
                                            title={!b.property_address ? "Add a property address first" : "Send monthly digest"}
                                            style={{
                                                padding: "6px 14px", borderRadius: 999, border: "1px solid",
                                                borderColor: didSend ? "rgba(0,232,122,0.5)" : b.property_address ? "rgba(0,232,122,0.3)" : "rgba(148,163,184,0.2)",
                                                background: didSend ? "rgba(0,232,122,0.1)" : "transparent",
                                                color: didSend ? "#00e87a" : b.property_address ? "rgba(0,232,122,0.8)" : "rgba(185,208,192,0.3)",
                                                fontSize: "0.78rem", fontWeight: 600, cursor: b.property_address && !isSending ? "pointer" : "default",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {isSending ? "Sending…" : didSend ? "Sent ✓" : "Send Digest"}
                                        </button>
                                    </div>
                                </div>

                                {/* Gift credits panel */}
                                {isGiftOpen && (
                                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                                        <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(0,232,122,0.5)" }}>
                                            Gift credits to {b.name.split(" ")[0]}
                                        </div>
                                        <div style={{ fontSize: "0.78rem", color: "rgba(185,208,192,0.5)" }}>
                                            Deducted from your balance. They can use credits for AI queries.
                                        </div>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                            {[50, 100, 250, 500].map(preset => (
                                                <button key={preset} type="button"
                                                    onClick={() => setGiftAmount(prev => ({ ...prev, [b.id]: String(preset) }))}
                                                    style={{
                                                        padding: "5px 12px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                                                        border: giftAmount[b.id] === String(preset) ? "1px solid rgba(0,232,122,0.5)" : "1px solid rgba(148,163,184,0.15)",
                                                        background: giftAmount[b.id] === String(preset) ? "rgba(0,232,122,0.1)" : "transparent",
                                                        color: giftAmount[b.id] === String(preset) ? "#00e87a" : "rgba(185,208,192,0.6)",
                                                    }}
                                                >{preset}</button>
                                            ))}
                                            <input
                                                type="number" min={10} max={5000}
                                                placeholder="Custom"
                                                value={giftAmount[b.id] ?? ""}
                                                onChange={e => setGiftAmount(prev => ({ ...prev, [b.id]: e.target.value }))}
                                                style={{
                                                    width: 80, padding: "5px 10px", borderRadius: 8,
                                                    border: "1px solid rgba(148,163,184,0.15)",
                                                    background: "rgba(255,255,255,0.04)",
                                                    color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit",
                                                }}
                                            />
                                            <button type="button"
                                                onClick={() => giftCredits(b)}
                                                disabled={isGifting || !giftAmount[b.id] || parseInt(giftAmount[b.id] ?? "0") < 10}
                                                style={{
                                                    padding: "6px 16px", borderRadius: 999, border: "none",
                                                    background: "#00e87a", color: "#080c12",
                                                    fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
                                                    opacity: isGifting ? 0.5 : 1,
                                                }}
                                            >{isGifting ? "Sending…" : "Send"}</button>
                                        </div>
                                        {giftErr && <div style={{ fontSize: "0.78rem", color: "#ff6b6b" }}>{giftErr}</div>}
                                        {didGift && <div style={{ fontSize: "0.78rem", color: "#00e87a" }}>Credits sent successfully!</div>}
                                    </div>
                                )}

                                {/* Property address row */}
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(0,232,122,0.5)", flexShrink: 0, width: 110 }}>
                                        Property Address
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="123 Main St, City, CA 90001"
                                        value={editVal}
                                        onChange={e => setEditing(prev => ({ ...prev, [b.id]: e.target.value }))}
                                        style={{
                                            flex: "1 1 200px", minWidth: 0,
                                            padding: "7px 10px", borderRadius: 8,
                                            border: `1px solid ${isDirty ? "rgba(0,232,122,0.4)" : "rgba(148,163,184,0.15)"}`,
                                            background: "rgba(255,255,255,0.04)",
                                            color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit",
                                        }}
                                        onKeyDown={e => { if (e.key === "Enter") saveAddress(b); }}
                                    />
                                    {isDirty && (
                                        <button type="button" onClick={() => saveAddress(b)} disabled={isSaving} style={{
                                            padding: "7px 14px", borderRadius: 8, border: "none",
                                            background: "#00e87a", color: "#080c12", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                                        }}>
                                            {isSaving ? "Saving…" : "Save"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </PageShell>
    );
}
