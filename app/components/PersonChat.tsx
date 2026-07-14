"use client";
// app/components/PersonChat.tsx
// Compact embedded chat scoped to a specific borrower.
// Used by the pre-call brief page — same API pipeline as the main chat:
//   POST /api/crm/person-message  — blocklist pre-flight + async extraction
//   POST /api/answers             — AI generation (same endpoint as main chat)
//   PUT  /api/v2/chats/[id]       — conversation storage (same chats table)
//
// COMPLIANCE:
//   Decision 7: All LO messages pass through /api/crm/person-message blocklist before AI.
//   Decision 1/2: Extraction fires async; raw message stored as NoteFact; excluded from generation.

import * as React from "react";

type ChatMessage = {
    role:    "user" | "assistant";
    content: string;
};

type Props = {
    borrowerId: string;
    borrowerName: string;
};

const accent = "#00e87a";

function genId() {
    return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function PersonChat({ borrowerId, borrowerName }: Props) {
    const [chatId,    setChatId]    = React.useState<string | null>(null);
    const [messages,  setMessages]  = React.useState<ChatMessage[]>([]);
    const [input,     setInput]     = React.useState("");
    const [sending,   setSending]   = React.useState(false);
    const [aiThinking, setAiThinking] = React.useState(false);
    const [blockErr,  setBlockErr]  = React.useState<string | null>(null);
    const [initDone,  setInitDone]  = React.useState(false);

    const bottomRef = React.useRef<HTMLDivElement>(null);
    const inputRef  = React.useRef<HTMLTextAreaElement>(null);

    // ── Init: find or create borrower-scoped thread ────────────────────────────

    React.useEffect(() => {
        if (!borrowerId) return;
        void (async () => {
            try {
                const res  = await fetch(`/api/crm/person-thread?borrower_id=${encodeURIComponent(borrowerId)}`);
                const data = await res.json();
                if (!res.ok) { setInitDone(true); return; }

                if (data.id) {
                    setChatId(data.id);
                    setMessages(
                        ((data.messages ?? []) as ChatMessage[])
                            .filter(m => m.role === "user" || m.role === "assistant"),
                    );
                }
            } catch {
                // Non-fatal — first message will create the thread
            } finally {
                setInitDone(true);
            }
        })();
    }, [borrowerId]);

    // ── Auto-scroll ────────────────────────────────────────────────────────────

    React.useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, aiThinking]);

    // ── Send message ───────────────────────────────────────────────────────────

    async function handleSend() {
        const text = input.trim();
        if (!text || sending) return;

        setInput("");
        setBlockErr(null);
        setSending(true);

        // Optimistically append user message
        const userMsg: ChatMessage = { role: "user", content: text };
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);

        try {
            // 1. Blocklist pre-flight
            const gateRes = await fetch("/api/crm/person-message", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ borrower_id: borrowerId, message: text }),
            });

            if (!gateRes.ok) {
                const gateData = await gateRes.json();
                // Revert optimistic message on block
                setMessages(messages);
                setInput(text);
                setBlockErr(gateData.error ?? "Message blocked by compliance filter.");
                return;
            }

            // 2. AI generation — same /api/answers as main chat
            setAiThinking(true);
            const activeId = chatId ?? genId();
            if (!chatId) setChatId(activeId);

            const aiRes = await fetch("/api/answers", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    question: text,
                    mode:     "borrower",
                    chat_id:  activeId,
                }),
            });

            setAiThinking(false);

            let aiContent = "";
            if (aiRes.ok) {
                const aiData = await aiRes.json().catch(() => null);
                // answers route returns { answer: string, ... } or { message: string, ... }
                aiContent =
                    (typeof aiData?.answer    === "string" ? aiData.answer    : null) ??
                    (typeof aiData?.message   === "string" ? aiData.message   : null) ??
                    (typeof aiData?.text      === "string" ? aiData.text      : null) ??
                    "";
            }

            const withAi: ChatMessage[] = aiContent
                ? [...nextMessages, { role: "assistant", content: aiContent }]
                : nextMessages;

            setMessages(withAi);

            // 3. Persist conversation to chats table
            await fetch(`/api/v2/chats/${encodeURIComponent(activeId)}`, {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    messages:    withAi,
                    borrower_id: borrowerId,
                    title:       `Chat — ${borrowerName}`,
                }),
            });

        } catch {
            setAiThinking(false);
            setMessages(messages);
            setInput(text);
            setBlockErr("Something went wrong. Please try again.");
        } finally {
            setSending(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    const empty = initDone && messages.length === 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: 480, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>

            {/* Message list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 12px" }}>
                {!initDone && (
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "rgba(185,208,192,0.4)" }}>Loading…</p>
                )}

                {empty && (
                    <div style={{ textAlign: "center", paddingTop: 60 }}>
                        <p style={{ margin: "0 0 8px", fontSize: "1rem", color: "rgba(185,208,192,0.55)", fontWeight: 600 }}>
                            Start the conversation
                        </p>
                        <p style={{ margin: 0, fontSize: "0.82rem", color: "rgba(185,208,192,0.35)", lineHeight: 1.6, maxWidth: 340, marginInline: "auto" }}>
                            Relay a call, ask what this client should do next, or note what changed. The platform captures and extracts what matters automatically.
                        </p>
                    </div>
                )}

                {messages.map((m, i) => (
                    <div
                        key={i}
                        style={{
                            display:    "flex",
                            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                            marginBottom: 10,
                        }}
                    >
                        <div
                            style={{
                                maxWidth:    "78%",
                                padding:     "9px 14px",
                                borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                                background:  m.role === "user"
                                    ? `${accent}1a`
                                    : "rgba(255,255,255,0.05)",
                                border: m.role === "user"
                                    ? `1px solid ${accent}30`
                                    : "1px solid rgba(255,255,255,0.07)",
                                fontSize:   "0.875rem",
                                lineHeight: 1.55,
                                color:      m.role === "user" ? "#e0f0e8" : "rgba(224,240,232,0.88)",
                                whiteSpace: "pre-wrap",
                                wordBreak:  "break-word",
                            }}
                        >
                            {m.content}
                        </div>
                    </div>
                ))}

                {aiThinking && (
                    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
                        <div style={{ padding: "9px 14px", borderRadius: "14px 14px 14px 4px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", fontSize: "0.875rem", color: "rgba(185,208,192,0.5)" }}>
                            Thinking…
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Blocklist error */}
            {blockErr && (
                <div style={{ padding: "8px 16px", background: "rgba(248,113,113,0.06)", borderTop: "1px solid rgba(248,113,113,0.15)", fontSize: "0.79rem", color: "#f87171", lineHeight: 1.5 }}>
                    {blockErr}
                </div>
            )}

            {/* Composer */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                    ref={inputRef}
                    rows={2}
                    style={{
                        flex:        1,
                        resize:      "none",
                        padding:     "8px 11px",
                        borderRadius: 8,
                        border:      "1px solid rgba(148,163,184,0.18)",
                        background:  "rgba(255,255,255,0.04)",
                        color:       "#e0f0e8",
                        fontSize:    "0.875rem",
                        fontFamily:  "inherit",
                        outline:     "none",
                        lineHeight:  1.5,
                    }}
                    placeholder={`Relay a call with ${borrowerName}, ask a question, or note what changed…`}
                    value={input}
                    onChange={e => { setInput(e.target.value); setBlockErr(null); }}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                />
                <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={sending || !input.trim()}
                    style={{
                        flexShrink: 0,
                        padding:    "8px 18px",
                        borderRadius: 8,
                        border:     "none",
                        background: sending || !input.trim() ? "rgba(0,232,122,0.25)" : accent,
                        color:      sending || !input.trim() ? "rgba(8,12,18,0.45)" : "#080c12",
                        fontWeight: 700,
                        fontSize:   "0.84rem",
                        cursor:     sending || !input.trim() ? "default" : "pointer",
                        transition: "background 0.15s",
                        lineHeight: "1.5",
                        alignSelf:  "stretch",
                    }}
                >
                    {sending ? "…" : "Send"}
                </button>
            </div>
        </div>
    );
}
