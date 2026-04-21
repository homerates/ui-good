"use client";
// app/lo/borrowers/page.tsx

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageShell from "../../components/PageShell";
import AddressAutocomplete from "../../components/AddressAutocomplete";

type Borrower = {
    id: string;
    name: string;
    email: string | null;
    user_id: string | null;
    property_address: string | null;
    digest_enabled: boolean;
    created_at: string;
    actual_balance:        number | null;
    actual_rate:           number | null;
    actual_purchase_price: number | null;
    actual_purchase_date:  string | null;
    actual_value:          number | null;
};

export default function LoBorrowersPage() {
    const { isLoaded, isSignedIn } = useAuth();
    const router = useRouter();
    const [isAgent, setIsAgent] = React.useState(false);
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
    const [sendingPreview, setSendingPreview] = React.useState<string | null>(null);
    const [sentPreviewOk, setSentPreviewOk]   = React.useState<string | null>(null);
    const [reportCopied, setReportCopied]     = React.useState<string | null>(null);
    // Gift credits state
    const [loBalance, setLoBalance] = React.useState<number | null>(null);
    const [giftOpen, setGiftOpen] = React.useState<string | null>(null);    // borrower id with open gift panel
    const [giftAmount, setGiftAmount] = React.useState<Record<string, string>>({});
    const [gifting, setGifting] = React.useState<string | null>(null);
    const [giftOk, setGiftOk] = React.useState<string | null>(null);
    const [giftErr, setGiftErr] = React.useState<string | null>(null);
    const [deleting, setDeleting] = React.useState<string | null>(null);
    // Loan detail overrides per borrower
    const [loanOpen, setLoanOpen]   = React.useState<string | null>(null);   // borrower id with open panel
    const [loanForm, setLoanForm]   = React.useState<Record<string, { balance: string; rate: string; purchasePrice: string; purchaseDate: string; email: string; value: string }>>({});
    const [loanSaving, setLoanSaving] = React.useState<string | null>(null);
    const [loanSaved,  setLoanSaved]  = React.useState<string | null>(null);
    // Quick-add state
    const [quickAddOpen, setQuickAddOpen] = React.useState(false);
    const [quickAdding, setQuickAdding] = React.useState(false);
    const [quickAddOk, setQuickAddOk] = React.useState(false);
    const [quickForm, setQuickForm] = React.useState({ name: "", email: "", address: "", sendWelcome: true });

    // Paste import state
    type ParsedBorrower = {
        name: string; email: string | null; property_address: string | null;
        purchase_price: number | null; loan_amount: number | null;
        interest_rate: number | null; close_date: string | null;
        notes: string | null; confidence: 'high' | 'medium' | 'low';
    };
    const [pasteOpen, setPasteOpen] = React.useState(false);
    const [pasteText, setPasteText] = React.useState('');
    const [parsing, setParsing] = React.useState(false);
    const [parsed, setParsed] = React.useState<ParsedBorrower[] | null>(null);
    const [parseErr, setParseErr] = React.useState<string | null>(null);
    const [addingIdx, setAddingIdx] = React.useState<number | null>(null);
    const [addedIdx, setAddedIdx] = React.useState<Set<number>>(new Set());
    const [skippedIdx, setSkippedIdx] = React.useState<Set<number>>(new Set());
    const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
    const [editDraft, setEditDraft] = React.useState<ParsedBorrower | null>(null);
    const [addingAll, setAddingAll] = React.useState(false);

    async function handleParse() {
        if (!pasteText.trim()) return;
        setParsing(true);
        setParseErr(null);
        setParsed(null);
        setAddedIdx(new Set());
        setSkippedIdx(new Set());
        try {
            const res = await fetch('/api/borrowers/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: pasteText }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) { setParseErr(data.error ?? 'Could not parse. Try again.'); }
            else if (data.borrowers.length === 0) { setParseErr('No borrowers found. Make sure names and emails are included.'); }
            else { setParsed(data.borrowers); }
        } catch { setParseErr('Unexpected error. Please try again.'); }
        setParsing(false);
    }

    async function confirmBorrower(b: ParsedBorrower, idx: number) {
        setAddingIdx(idx);
        try {
            // Step 1 — create the borrower record
            const res = await fetch('/api/borrowers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: b.name,
                    email: b.email ?? null,
                    property_address: b.property_address ?? null,
                    send_welcome: false,
                }),
            });
            const data = await res.json();
            if (!data.borrower) { setParseErr(data.error ?? 'Failed to add borrower'); setAddingIdx(null); return; }

            // Step 2 — patch loan details if any were parsed
            const hasLoanData = b.purchase_price || b.loan_amount || b.interest_rate || b.close_date;
            if (hasLoanData) {
                const patch: Record<string, any> = { id: data.borrower.id };
                if (b.purchase_price)  patch.actual_purchase_price = b.purchase_price;
                if (b.loan_amount)     patch.actual_balance         = b.loan_amount;
                if (b.interest_rate)   patch.actual_rate            = b.interest_rate;
                if (b.close_date)      patch.actual_purchase_date   = b.close_date;
                const patchRes = await fetch('/api/borrowers', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(patch),
                });
                const patchData = await patchRes.json();
                if (patchData.borrower) {
                    setBorrowers(prev => [patchData.borrower, ...prev]);
                    setAddedIdx(prev => new Set([...prev, idx]));
                    setAddingIdx(null);
                    return;
                }
            }

            setBorrowers(prev => [data.borrower, ...prev]);
            setAddedIdx(prev => new Set([...prev, idx]));
        } catch { setParseErr('Unexpected error.'); }
        setAddingIdx(null);
    }

    function skipBorrower(idx: number) {
        setSkippedIdx(prev => new Set([...prev, idx]));
    }

    function findDuplicate(name: string, email: string | null): Borrower | null {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        if (email) {
            const emailMatch = borrowers.find(b => b.email && b.email.toLowerCase() === email.toLowerCase());
            if (emailMatch) return emailMatch;
        }
        const normName = norm(name);
        return borrowers.find(b => norm(b.name) === normName) ?? null;
    }

    async function addAllBorrowers() {
        if (!parsed) return;
        setAddingAll(true);
        for (let i = 0; i < parsed.length; i++) {
            if (addedIdx.has(i) || skippedIdx.has(i)) continue;
            await confirmBorrower(parsed[i], i);
        }
        setAddingAll(false);
    }

    function startEdit(b: ParsedBorrower, idx: number) {
        setEditDraft({ ...b });
        setEditingIdx(idx);
    }

    function saveEdit(idx: number) {
        if (!editDraft || !parsed) return;
        const next = [...parsed];
        next[idx] = editDraft;
        setParsed(next);
        setEditingIdx(null);
        setEditDraft(null);
    }

    function resetPaste() {
        setPasteText('');
        setParsed(null);
        setParseErr(null);
        setAddedIdx(new Set());
        setSkippedIdx(new Set());
        setEditingIdx(null);
        setEditDraft(null);
        setAddingAll(false);
    }

    React.useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.replace("/sign-in?redirect_url=" + encodeURIComponent("/lo/borrowers"));
        }
    }, [isLoaded, isSignedIn, router]);

    React.useEffect(() => {
        fetch("/api/borrowers")
            .then(r => r.json())
            .then(d => {
                if (d.error) setError(d.error);
                setBorrowers(d.borrowers ?? []);
                setLoading(false);
            })
            .catch(() => { setError("Failed to load clients. Please refresh."); setLoading(false); });
        fetch("/api/credits")
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.balance !== undefined) setLoBalance(d.balance); })
            .catch(() => {});
        fetch("/api/profile")
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.role === "agent" || d?.agent) setIsAgent(true); })
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

    async function handleQuickAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!quickForm.name || !quickForm.email) return;
        const dup = findDuplicate(quickForm.name, quickForm.email);
        if (dup) { setError(`Already in your pipeline as "${dup.name}"${dup.email ? ` (${dup.email})` : ''}.`); return; }
        setQuickAdding(true);
        setError(null);
        try {
            const res = await fetch("/api/borrowers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: quickForm.name.trim(),
                    email: quickForm.email.trim(),
                    property_address: quickForm.address.trim() || null,
                    send_welcome: quickForm.sendWelcome,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error ?? "Failed to add borrower."); }
            else {
                setBorrowers(prev => [data.borrower, ...prev]);
                setQuickAddOk(true);
                setQuickForm({ name: "", email: "", address: "", sendWelcome: true });
                setTimeout(() => { setQuickAddOk(false); setQuickAddOpen(false); }, 3000);
            }
        } catch { setError("Unexpected error. Please try again."); }
        setQuickAdding(false);
    }

    async function handleCopy() {
        if (!inviteUrl) return;
        try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
        catch { setError("Could not copy to clipboard."); }
    }

    async function saveAddress(borrower: Borrower) {
        const address = editing[borrower.id] ?? borrower.property_address ?? '';
        setSaving(borrower.id);
        // Enrich property data from Redfin in background
        if (address.trim()) {
            void fetch('/api/property/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: address.trim() }),
            });
        }
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

    function openLoanEditor(b: Borrower) {
        setLoanForm(prev => ({
            ...prev,
            [b.id]: {
                balance:       b.actual_balance        ? String(b.actual_balance)        : '',
                rate:          b.actual_rate           ? String(b.actual_rate)           : '',
                purchasePrice: b.actual_purchase_price ? String(b.actual_purchase_price) : '',
                purchaseDate:  b.actual_purchase_date  ?? '',
                value:         b.actual_value          ? String(b.actual_value)          : '',
                email:         b.email ?? '',
            },
        }));
        setLoanOpen(prev => prev === b.id ? null : b.id);
        setLoanSaved(null);
    }

    async function saveLoanDetails(b: Borrower) {
        const f = loanForm[b.id];
        if (!f) return;
        setLoanSaving(b.id);
        const res = await fetch('/api/borrowers', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: b.id,
                actual_balance:        f.balance       ? Number(f.balance)       : null,
                actual_rate:           f.rate          ? Number(f.rate)          : null,
                actual_purchase_price: f.purchasePrice ? Number(f.purchasePrice) : null,
                actual_purchase_date:  f.purchaseDate  || null,
                actual_value:          f.value         ? Number(f.value)         : null,
                ...(f.email.trim() ? { email: f.email.trim() } : {}),
            }),
        });
        const data = await res.json().catch(() => ({}));
        setLoanSaving(null);
        if (data.borrower) {
            setBorrowers(prev => prev.map(x => x.id === b.id ? { ...x, ...data.borrower } : x));
            setLoanSaved(b.id);
            setTimeout(() => { setLoanSaved(null); setLoanOpen(null); }, 2500);
        } else {
            setError(data.error ?? 'Failed to save loan details');
        }
    }

    async function sendPreviewToSelf(borrower: Borrower) {
        if (!borrower.property_address) return;
        setSendingPreview(borrower.id);
        setSentPreviewOk(null);
        const res = await fetch('/api/digest/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ borrower_id: borrower.id, send_to_lo: true }),
        });
        const data = await res.json();
        setSendingPreview(null);
        if (data.ok) { setSentPreviewOk(borrower.id); setTimeout(() => setSentPreviewOk(null), 4000); }
        else { setError(data.error ?? 'Failed to send preview.'); }
    }

    async function generateReport(borrower: Borrower) {
        const res = await fetch('/api/report/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ borrower_id: borrower.id }),
        });
        const data = await res.json();
        if (!data.ok) { setError(data.error ?? 'Failed to generate report.'); return; }
        const url = `${window.location.origin}/report/${data.token}`;
        // Mobile Safari: use Web Share API if available, clipboard as fallback
        if (navigator.share) {
            await navigator.share({ title: `${borrower.name} — Home Intelligence Report`, url }).catch(() => {});
        } else {
            await navigator.clipboard.writeText(url).catch(() => {});
        }
        setReportCopied(borrower.id);
        setTimeout(() => setReportCopied(null), 4000);
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
                    <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 4px", color: "#f1f5f9" }}>{isAgent ? "Clients" : "Borrowers"}</h1>
                    <p style={{ margin: 0, fontSize: "0.88rem", color: "rgba(185,208,192,0.7)" }}>
                        Manage {isAgent ? "clients" : "borrowers"}, set their property address, and send monthly home digests.
                    </p>
                    {loBalance !== null && (
                        <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "rgba(0,232,122,0.7)" }}>
                            Your credit balance: <strong style={{ color: "#00e87a" }}>{loBalance.toLocaleString()}</strong>
                        </p>
                    )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { setPasteOpen(o => !o); setQuickAddOpen(false); setError(null); resetPaste(); }} style={{
                        padding: "9px 18px", borderRadius: 999, border: "1px solid rgba(99,179,237,0.4)",
                        background: pasteOpen ? "rgba(99,179,237,0.1)" : "transparent",
                        color: "#63b3ed", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                    }}>
                        ⚡ Paste Import
                    </button>
                    <button type="button" onClick={() => { setQuickAddOpen(o => !o); setPasteOpen(false); setError(null); }} style={{
                        padding: "9px 18px", borderRadius: 999, border: "1px solid rgba(0,232,122,0.4)",
                        background: quickAddOpen ? "rgba(0,232,122,0.1)" : "transparent",
                        color: "#00e87a", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                    }}>
                        + Add by Email
                    </button>
                    <button type="button" onClick={handleCreateInvite} disabled={creating} style={{
                        padding: "9px 18px", borderRadius: 999, border: "none",
                        background: creating ? "rgba(0,232,122,0.3)" : "#00e87a",
                        color: creating ? "rgba(8,12,18,0.5)" : "#080c12",
                        fontSize: "0.88rem", fontWeight: 600, cursor: creating ? "default" : "pointer", whiteSpace: "nowrap",
                    }}>
                        {creating ? "Creating…" : "+ Invite Link"}
                    </button>
                </div>
            </div>

            {/* Paste Import panel */}
            {pasteOpen && (
                <section style={{
                    padding: "18px 20px", borderRadius: 12, marginBottom: 20,
                    border: "1px solid rgba(99,179,237,0.2)", background: "rgba(99,179,237,0.03)",
                }}>
                    <p style={{ margin: "0 0 4px", fontSize: "0.88rem", fontWeight: 600, color: "#e0f0e8" }}>
                        ⚡ Paste & Import
                    </p>
                    <p style={{ margin: "0 0 14px", fontSize: "0.78rem", color: "rgba(185,208,192,0.55)", lineHeight: 1.6 }}>
                        Paste anything — a forwarded email, spreadsheet rows, notes from a call, or a CRM export.
                        AI extracts names, emails, addresses and loan details automatically.
                    </p>

                    {!parsed ? (
                        <>
                            <textarea
                                value={pasteText}
                                onChange={e => setPasteText(e.target.value)}
                                placeholder={"John Smith, john@email.com, 123 Main St Irvine CA, $750k purchase, closing June 2026\n\nOr paste a forwarded email, spreadsheet rows, notes from a call…"}
                                rows={6}
                                style={{
                                    width: "100%", boxSizing: "border-box", padding: "10px 12px",
                                    borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)",
                                    background: "rgba(255,255,255,0.04)", color: "#e0f0e8",
                                    fontSize: "0.82rem", lineHeight: 1.6, outline: "none",
                                    fontFamily: "inherit", resize: "vertical",
                                }}
                            />
                            {parseErr && <p style={{ margin: "8px 0 0", fontSize: "0.8rem", color: "#f87171" }}>{parseErr}</p>}
                            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                                <button
                                    type="button"
                                    onClick={handleParse}
                                    disabled={parsing || !pasteText.trim()}
                                    style={{
                                        padding: "8px 20px", borderRadius: 999, border: "none",
                                        background: parsing || !pasteText.trim() ? "rgba(99,179,237,0.3)" : "#63b3ed",
                                        color: parsing || !pasteText.trim() ? "rgba(8,12,18,0.5)" : "#080c12",
                                        fontSize: "0.85rem", fontWeight: 600,
                                        cursor: parsing || !pasteText.trim() ? "default" : "pointer",
                                    }}
                                >
                                    {parsing ? "Parsing…" : "Parse →"}
                                </button>
                                <button type="button" onClick={() => setPasteOpen(false)} style={{
                                    padding: "8px 16px", borderRadius: 999,
                                    border: "1px solid rgba(148,163,184,0.2)", background: "transparent",
                                    color: "rgba(185,208,192,0.6)", fontSize: "0.85rem", cursor: "pointer",
                                }}>
                                    Cancel
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p style={{ margin: "0 0 12px", fontSize: "0.82rem", color: "rgba(185,208,192,0.7)" }}>
                                Found <strong style={{ color: "#e0f0e8" }}>{parsed.length}</strong> borrower{parsed.length !== 1 ? 's' : ''} — edit, add individually, or use Add All:
                            </p>
                            <div style={{ display: "grid", gap: 10 }}>
                                {parsed.map((b, i) => {
                                    const added   = addedIdx.has(i);
                                    const skipped = skippedIdx.has(i);
                                    const busy    = addingIdx === i || addingAll;
                                    const editing = editingIdx === i;
                                    const inputSty: React.CSSProperties = {
                                        width: "100%", padding: "4px 8px", borderRadius: 6, fontSize: "0.78rem",
                                        border: "1px solid rgba(99,179,237,0.3)", background: "rgba(8,12,18,0.6)",
                                        color: "#f1f5f9", outline: "none", boxSizing: "border-box",
                                    };
                                    return (
                                        <div key={i} style={{
                                            padding: "12px 14px", borderRadius: 10,
                                            border: added ? "1px solid rgba(0,232,122,0.3)" : skipped ? "1px solid rgba(148,163,184,0.1)" : editing ? "1px solid rgba(99,179,237,0.4)" : "1px solid rgba(99,179,237,0.2)",
                                            background: added ? "rgba(0,232,122,0.04)" : skipped ? "rgba(0,0,0,0.1)" : editing ? "rgba(99,179,237,0.06)" : "rgba(99,179,237,0.04)",
                                            opacity: skipped ? 0.5 : 1,
                                        }}>
                                            {editing && editDraft ? (
                                                <div style={{ display: "grid", gap: 6 }}>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                                        <div>
                                                            <div style={{ fontSize: "0.68rem", color: "rgba(185,208,192,0.5)", marginBottom: 2 }}>Name</div>
                                                            <input style={inputSty} value={editDraft.name} onChange={e => setEditDraft(d => d ? { ...d, name: e.target.value } : d)} />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: "0.68rem", color: "rgba(185,208,192,0.5)", marginBottom: 2 }}>Email</div>
                                                            <input style={inputSty} value={editDraft.email ?? ''} placeholder="email@example.com" onChange={e => setEditDraft(d => d ? { ...d, email: e.target.value || null } : d)} />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: "0.68rem", color: "rgba(185,208,192,0.5)", marginBottom: 2 }}>Address</div>
                                                        <input style={inputSty} value={editDraft.property_address ?? ''} onChange={e => setEditDraft(d => d ? { ...d, property_address: e.target.value || null } : d)} />
                                                    </div>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                                                        <div>
                                                            <div style={{ fontSize: "0.68rem", color: "rgba(185,208,192,0.5)", marginBottom: 2 }}>Purchase $</div>
                                                            <input style={inputSty} value={editDraft.purchase_price ?? ''} placeholder="980000" onChange={e => setEditDraft(d => d ? { ...d, purchase_price: e.target.value ? Number(e.target.value) : null } : d)} />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: "0.68rem", color: "rgba(185,208,192,0.5)", marginBottom: 2 }}>Loan $</div>
                                                            <input style={inputSty} value={editDraft.loan_amount ?? ''} placeholder="650000" onChange={e => setEditDraft(d => d ? { ...d, loan_amount: e.target.value ? Number(e.target.value) : null } : d)} />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: "0.68rem", color: "rgba(185,208,192,0.5)", marginBottom: 2 }}>Rate %</div>
                                                            <input style={inputSty} value={editDraft.interest_rate ?? ''} placeholder="5.99" onChange={e => setEditDraft(d => d ? { ...d, interest_rate: e.target.value ? Number(e.target.value) : null } : d)} />
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: "0.68rem", color: "rgba(185,208,192,0.5)", marginBottom: 2 }}>Close date</div>
                                                            <input style={inputSty} value={editDraft.close_date ?? ''} placeholder="2026-04-07" onChange={e => setEditDraft(d => d ? { ...d, close_date: e.target.value || null } : d)} />
                                                        </div>
                                                    </div>
                                                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                                        <button type="button" onClick={() => saveEdit(i)} style={{
                                                            padding: "4px 14px", borderRadius: 999, border: "none",
                                                            background: "#63b3ed", color: "#080c12", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                                                        }}>Save</button>
                                                        <button type="button" onClick={() => { setEditingIdx(null); setEditDraft(null); }} style={{
                                                            padding: "4px 10px", borderRadius: 999,
                                                            border: "1px solid rgba(148,163,184,0.2)", background: "transparent",
                                                            color: "rgba(185,208,192,0.5)", fontSize: "0.78rem", cursor: "pointer",
                                                        }}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        {(() => {
                                                            const dup = !added && !skipped ? findDuplicate(b.name, b.email) : null;
                                                            return (<>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#f1f5f9" }}>{b.name}</span>
                                                                    <span style={{
                                                                        fontSize: "0.7rem", padding: "1px 6px", borderRadius: 999,
                                                                        background: b.confidence === 'high' ? "rgba(0,232,122,0.15)" : b.confidence === 'medium' ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
                                                                        color: b.confidence === 'high' ? "#00e87a" : b.confidence === 'medium' ? "#fbbf24" : "#f87171",
                                                                    }}>{b.confidence}</span>
                                                                    {dup && <span style={{ fontSize: "0.7rem", padding: "1px 7px", borderRadius: 999, background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>⚠ Already in pipeline</span>}
                                                                </div>
                                                                {dup && <div style={{ fontSize: "0.74rem", color: "rgba(251,191,36,0.55)", marginTop: 2 }}>Matches "{dup.name}"{dup.email ? ` · ${dup.email}` : ''}</div>}
                                                            </>);
                                                        })()}
                                                        {b.email
                                                            ? <div style={{ fontSize: "0.78rem", color: "rgba(185,208,192,0.7)", marginTop: 2 }}>{b.email}</div>
                                                            : !added && !skipped && <div style={{ fontSize: "0.75rem", color: "rgba(251,191,36,0.6)", marginTop: 2 }}>No email — tap Edit to add</div>
                                                        }
                                                        {b.property_address && <div style={{ fontSize: "0.78rem", color: "rgba(185,208,192,0.7)", marginTop: 2 }}>📍 {b.property_address}</div>}
                                                        {(b.purchase_price || b.loan_amount || b.interest_rate || b.close_date) && (
                                                            <div style={{ fontSize: "0.78rem", color: "rgba(185,208,192,0.55)", marginTop: 2 }}>
                                                                {[
                                                                    b.purchase_price ? `Purchase: $${b.purchase_price.toLocaleString()}` : null,
                                                                    b.loan_amount    ? `Loan: $${b.loan_amount.toLocaleString()}` : null,
                                                                    b.interest_rate  ? `Rate: ${b.interest_rate}%` : null,
                                                                    b.close_date     ? `Close: ${b.close_date}` : null,
                                                                ].filter(Boolean).join(' · ')}
                                                            </div>
                                                        )}
                                                        {b.notes && <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.4)", marginTop: 2, fontStyle: "italic" }}>{b.notes}</div>}
                                                    </div>
                                                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                                        {added ? (
                                                            <span style={{ fontSize: "0.8rem", color: "#00e87a", fontWeight: 600 }}>✓ Added</span>
                                                        ) : skipped ? (
                                                            <span style={{ fontSize: "0.8rem", color: "rgba(185,208,192,0.4)" }}>Skipped</span>
                                                        ) : (
                                                            <>
                                                                <button type="button" onClick={() => startEdit(b, i)} disabled={busy} style={{
                                                                    padding: "5px 10px", borderRadius: 999,
                                                                    border: "1px solid rgba(99,179,237,0.35)", background: "transparent",
                                                                    color: "#63b3ed", fontSize: "0.78rem", cursor: busy ? "default" : "pointer",
                                                                }}>Edit</button>
                                                                <button type="button" onClick={() => confirmBorrower(b, i)} disabled={busy} style={{
                                                                    padding: "5px 14px", borderRadius: 999, border: "none",
                                                                    background: busy ? "rgba(0,232,122,0.3)" : "#00e87a",
                                                                    color: "#080c12", fontSize: "0.78rem", fontWeight: 600,
                                                                    cursor: busy ? "default" : "pointer",
                                                                }}>
                                                                    {busy ? "Adding…" : "Add"}
                                                                </button>
                                                                <button type="button" onClick={() => skipBorrower(i)} disabled={busy} style={{
                                                                    padding: "5px 10px", borderRadius: 999,
                                                                    border: "1px solid rgba(148,163,184,0.2)", background: "transparent",
                                                                    color: "rgba(185,208,192,0.5)", fontSize: "0.78rem", cursor: busy ? "default" : "pointer",
                                                                }}>Skip</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {parseErr && <p style={{ margin: "10px 0 0", fontSize: "0.8rem", color: "#f87171" }}>{parseErr}</p>}
                            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                {(() => {
                                    const pending = parsed.filter((_, i) => !addedIdx.has(i) && !skippedIdx.has(i)).length;
                                    return pending > 0 ? (
                                        <button type="button" onClick={addAllBorrowers} disabled={addingAll || editingIdx !== null} style={{
                                            padding: "7px 18px", borderRadius: 999, border: "none",
                                            background: addingAll ? "rgba(0,232,122,0.3)" : "#00e87a",
                                            color: "#080c12", fontSize: "0.82rem", fontWeight: 700,
                                            cursor: addingAll || editingIdx !== null ? "default" : "pointer",
                                        }}>
                                            {addingAll ? "Adding…" : `Add All (${pending})`}
                                        </button>
                                    ) : null;
                                })()}
                                <button type="button" onClick={resetPaste} style={{
                                    padding: "7px 16px", borderRadius: 999,
                                    border: "1px solid rgba(99,179,237,0.3)", background: "transparent",
                                    color: "#63b3ed", fontSize: "0.82rem", cursor: "pointer",
                                }}>
                                    ← Paste more
                                </button>
                                <button type="button" onClick={() => { resetPaste(); setPasteOpen(false); }} style={{
                                    padding: "7px 16px", borderRadius: 999,
                                    border: "1px solid rgba(148,163,184,0.15)", background: "transparent",
                                    color: "rgba(185,208,192,0.5)", fontSize: "0.82rem", cursor: "pointer",
                                }}>
                                    Done
                                </button>
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* Quick-add panel */}
            {quickAddOpen && (
                <section style={{
                    padding: "18px 20px", borderRadius: 12, marginBottom: 20,
                    border: "1px solid rgba(0,232,122,0.2)", background: "rgba(0,232,122,0.03)",
                }}>
                    <p style={{ margin: "0 0 14px", fontSize: "0.88rem", fontWeight: 600, color: "#e0f0e8" }}>
                        Add a {isAgent ? "client" : "borrower"} by email
                    </p>
                    <p style={{ margin: "0 0 16px", fontSize: "0.78rem", color: "rgba(185,208,192,0.55)", lineHeight: 1.6 }}>
                        They'll receive a welcome email from you with today's rate and a link to activate their free account.
                        A one-click unsubscribe is included in every email.
                    </p>
                    {quickAddOk ? (
                        <p style={{ color: "#00e87a", fontSize: "0.88rem", fontWeight: 600 }}>
                            ✓ {isAgent ? "Client" : "Borrower"} added{quickForm.sendWelcome ? " and welcome email sent" : ""}
                        </p>
                    ) : (
                        <form onSubmit={handleQuickAdd} style={{ display: "grid", gap: 10 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <input
                                    type="text" required placeholder="Full name"
                                    value={quickForm.name}
                                    onChange={e => setQuickForm(p => ({ ...p, name: e.target.value }))}
                                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                                />
                                <input
                                    type="email" required placeholder="Email address"
                                    value={quickForm.email}
                                    onChange={e => setQuickForm(p => ({ ...p, email: e.target.value }))}
                                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                                />
                            </div>
                            <AddressAutocomplete
                                placeholder="Property address (optional — enhances welcome email)"
                                value={quickForm.address}
                                onChange={v => setQuickForm(p => ({ ...p, address: v }))}
                                onSelect={v => setQuickForm(p => ({ ...p, address: v }))}
                                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                            />
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: "rgba(185,208,192,0.7)", cursor: "pointer" }}>
                                <input
                                    type="checkbox" checked={quickForm.sendWelcome}
                                    onChange={e => setQuickForm(p => ({ ...p, sendWelcome: e.target.checked }))}
                                    style={{ accentColor: "#00e87a", width: 14, height: 14 }}
                                />
                                Send welcome email with today's rate &amp; account activation link
                            </label>
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                <button type="submit" disabled={quickAdding} style={{
                                    padding: "9px 20px", borderRadius: 999, border: "none",
                                    background: quickAdding ? "rgba(0,232,122,0.3)" : "#00e87a",
                                    color: "#080c12", fontSize: "0.85rem", fontWeight: 700, cursor: quickAdding ? "default" : "pointer",
                                }}>
                                    {quickAdding ? "Adding…" : isAgent ? "Add Client" : "Add Borrower"}
                                </button>
                                <button type="button" onClick={() => setQuickAddOpen(false)} style={{
                                    padding: "9px 16px", borderRadius: 999,
                                    border: "1px solid rgba(148,163,184,0.2)", background: "transparent",
                                    color: "rgba(185,208,192,0.5)", fontSize: "0.85rem", cursor: "pointer",
                                }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </section>
            )}

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
                <p style={{ color: "rgba(185,208,192,0.5)", fontSize: "0.88rem" }}>Loading {isAgent ? "clients" : "borrowers"}…</p>
            ) : borrowers.length === 0 ? (
                <div style={{ padding: "40px 24px", borderRadius: 14, border: "1px dashed rgba(148,163,184,0.15)", textAlign: "center" }}>
                    <p style={{ color: "rgba(185,208,192,0.5)", margin: "0 0 8px" }}>No {isAgent ? "clients" : "borrowers"} yet.</p>
                    <p style={{ color: "rgba(185,208,192,0.35)", fontSize: "0.82rem", margin: 0 }}>Invite a {isAgent ? "client" : "borrower"} using the button above.</p>
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

                        const isLoanOpen   = loanOpen   === b.id;
                        const isLoanSaving = loanSaving === b.id;
                        const didLoanSave  = loanSaved  === b.id;
                        const lf = loanForm[b.id] ?? { balance: '', rate: '', purchasePrice: '', purchaseDate: '', value: '' };
                        const hasOverrides = !!(b.actual_balance || b.actual_rate || b.actual_purchase_price || b.actual_purchase_date || b.actual_value);

                        const isSendingPreview = sendingPreview === b.id;
                        const didSendPreview   = sentPreviewOk  === b.id;

                        return (
                            <div key={b.id} style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.1)", background: "rgba(255,255,255,0.025)", display: "flex", flexDirection: "column", gap: 12 }}>
                                {/* Top row — name + email */}
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#e0f0e8" }}>{b.name}</div>
                                        {b.email && <div style={{ fontSize: "0.75rem", color: "rgba(185,208,192,0.5)", marginTop: 2 }}>{b.email}</div>}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        {/* View home intelligence */}
                                        <Link
                                            href={`/my-home?borrower_id=${b.id}`}
                                            title={!b.property_address ? "Add a property address first" : `View ${b.name.split(' ')[0]}'s home intelligence`}
                                            style={{
                                                padding: "6px 14px", borderRadius: 999,
                                                border: `1px solid ${b.property_address ? "rgba(0,232,122,0.3)" : "rgba(148,163,184,0.15)"}`,
                                                background: "transparent",
                                                color: b.property_address ? "rgba(0,232,122,0.8)" : "rgba(185,208,192,0.3)",
                                                fontSize: "0.78rem", fontWeight: 600,
                                                pointerEvents: b.property_address ? "auto" : "none",
                                                textDecoration: "none", whiteSpace: "nowrap",
                                                display: "inline-block",
                                            }}
                                        >
                                            View Home →
                                        </Link>
                                        {/* Send Report button */}
                                        {b.property_address && (
                                            <button
                                                type="button"
                                                onClick={() => generateReport(b)}
                                                style={{
                                                    padding: "6px 14px", borderRadius: 999,
                                                    border: "1px solid rgba(0,232,122,0.35)",
                                                    background: reportCopied === b.id ? "rgba(0,232,122,0.12)" : "transparent",
                                                    color: reportCopied === b.id ? "#00e87a" : "rgba(0,232,122,0.7)",
                                                    fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                                                }}
                                            >
                                                {reportCopied === b.id ? "Link Copied ✓" : "📋 Report Link"}
                                            </button>
                                        )}
                                        {/* Loan details override button */}
                                        <button
                                            type="button"
                                            onClick={() => openLoanEditor(b)}
                                            style={{
                                                padding: "6px 14px", borderRadius: 999,
                                                border: `1px solid ${hasOverrides ? "rgba(0,232,122,0.4)" : "rgba(148,163,184,0.2)"}`,
                                                background: isLoanOpen ? "rgba(0,232,122,0.08)" : "transparent",
                                                color: hasOverrides ? "rgba(0,232,122,0.8)" : "rgba(185,208,192,0.6)",
                                                fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                                            }}
                                        >
                                            {hasOverrides ? "Loan Details ✓" : "Loan Details"}
                                        </button>
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
                                        {/* Send to LO preview button */}
                                        <button
                                            type="button"
                                            onClick={() => sendPreviewToSelf(b)}
                                            disabled={isSendingPreview || !b.property_address || didSendPreview}
                                            title={!b.property_address ? "Add a property address first" : "Send this borrower's digest to your own inbox"}
                                            style={{
                                                padding: "6px 14px", borderRadius: 999, border: "1px solid",
                                                borderColor: didSendPreview ? "rgba(99,179,237,0.6)" : b.property_address ? "rgba(99,179,237,0.3)" : "rgba(148,163,184,0.2)",
                                                background: didSendPreview ? "rgba(99,179,237,0.1)" : "transparent",
                                                color: didSendPreview ? "#63b3ed" : b.property_address ? "rgba(99,179,237,0.8)" : "rgba(185,208,192,0.3)",
                                                fontSize: "0.78rem", fontWeight: 600, cursor: b.property_address && !isSendingPreview ? "pointer" : "default",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {isSendingPreview ? "Sending…" : didSendPreview ? "Sent to You ✓" : "Send to Me"}
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

                                {/* Loan details override panel */}
                                {isLoanOpen && (
                                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,232,122,0.15)", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                                        <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(0,232,122,0.5)" }}>
                                            Loan Details — {b.name.split(" ")[0]}
                                        </div>
                                        <p style={{ margin: 0, fontSize: "0.78rem", color: "rgba(185,208,192,0.5)", lineHeight: 1.5 }}>
                                            Override Rentcast estimates with actual loan data. Leave blank to keep using estimates.
                                        </p>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                            <label style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.5)", fontWeight: 600 }}>Email {!b.email && <span style={{ color: "#fbbf24" }}>— missing</span>}</label>
                                            <input
                                                type="email" placeholder="borrower@email.com"
                                                value={lf.email}
                                                onChange={e => setLoanForm(prev => ({ ...prev, [b.id]: { ...lf, email: e.target.value } }))}
                                                style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                                            />
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                <label style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.5)", fontWeight: 600 }}>Current Balance ($)</label>
                                                <input
                                                    type="number" min={0} placeholder="e.g. 412000"
                                                    value={lf.balance}
                                                    onChange={e => setLoanForm(prev => ({ ...prev, [b.id]: { ...lf, balance: e.target.value } }))}
                                                    style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                                                />
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                <label style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.5)", fontWeight: 600 }}>Interest Rate (%)</label>
                                                <input
                                                    type="number" min={0} max={20} step={0.01} placeholder="e.g. 3.25"
                                                    value={lf.rate}
                                                    onChange={e => setLoanForm(prev => ({ ...prev, [b.id]: { ...lf, rate: e.target.value } }))}
                                                    style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                                                />
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                <label style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.5)", fontWeight: 600 }}>Purchase Price ($)</label>
                                                <input
                                                    type="number" min={0} placeholder="e.g. 550000"
                                                    value={lf.purchasePrice}
                                                    onChange={e => setLoanForm(prev => ({ ...prev, [b.id]: { ...lf, purchasePrice: e.target.value } }))}
                                                    style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                                                />
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                <label style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.5)", fontWeight: 600 }}>Close Date</label>
                                                <input
                                                    type="date"
                                                    value={lf.purchaseDate}
                                                    onChange={e => setLoanForm(prev => ({ ...prev, [b.id]: { ...lf, purchaseDate: e.target.value } }))}
                                                    style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                                                />
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                                                <label style={{ fontSize: "0.72rem", color: "rgba(185,208,192,0.5)", fontWeight: 600 }}>
                                                    Verified Value ($) <span style={{ color: "rgba(0,232,122,0.5)", fontWeight: 400 }}>— appraisal or last known good valuation</span>
                                                </label>
                                                <input
                                                    type="number" min={0} placeholder="e.g. 239000 — overrides AVM estimate"
                                                    value={lf.value}
                                                    onChange={e => setLoanForm(prev => ({ ...prev, [b.id]: { ...lf, value: e.target.value } }))}
                                                    style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${lf.value ? "rgba(0,232,122,0.35)" : "rgba(148,163,184,0.2)"}`, background: "rgba(255,255,255,0.04)", color: "#e0f0e8", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" }}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <button type="button" onClick={() => saveLoanDetails(b)} disabled={isLoanSaving} style={{
                                                padding: "7px 18px", borderRadius: 999, border: "none",
                                                background: "#00e87a", color: "#080c12",
                                                fontSize: "0.82rem", fontWeight: 700, cursor: isLoanSaving ? "default" : "pointer",
                                                opacity: isLoanSaving ? 0.5 : 1,
                                            }}>
                                                {isLoanSaving ? "Saving…" : didLoanSave ? "Saved ✓" : "Save Loan Details"}
                                            </button>
                                            <button type="button" onClick={() => setLoanOpen(null)} style={{
                                                padding: "7px 14px", borderRadius: 999,
                                                border: "1px solid rgba(148,163,184,0.15)", background: "transparent",
                                                color: "rgba(185,208,192,0.45)", fontSize: "0.82rem", cursor: "pointer",
                                            }}>Cancel</button>
                                        </div>
                                        {hasOverrides && (
                                            <p style={{ margin: 0, fontSize: "0.72rem", color: "rgba(0,232,122,0.5)" }}>
                                                Active overrides: {[b.actual_balance && `balance $${Number(b.actual_balance).toLocaleString()}`, b.actual_rate && `rate ${b.actual_rate}%`, b.actual_purchase_price && `purchase $${Number(b.actual_purchase_price).toLocaleString()}`, b.actual_purchase_date && `closed ${b.actual_purchase_date}`].filter(Boolean).join(" · ")}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Property address row */}
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(0,232,122,0.5)", flexShrink: 0, width: 110 }}>
                                        Property Address
                                    </div>
                                    <AddressAutocomplete
                                        placeholder="123 Main St, City, CA 90001"
                                        value={editVal}
                                        onChange={v => setEditing(prev => ({ ...prev, [b.id]: v }))}
                                        onSelect={v => setEditing(prev => ({ ...prev, [b.id]: v }))}
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
