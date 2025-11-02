'use client';

import * as React from 'react';
import Sidebar, {
  type SidebarHistoryItem,
} from './components/Sidebar';
import Link from 'next/link';

type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string };

export default function Page() {
  // === Sidebar state & handlers =================================================
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const toggleSidebar = () => setSidebarOpen((v) => !v);

  const [history, setHistory] = React.useState<SidebarHistoryItem[]>([
    // seed example rows so layout doesn’t look empty; safe to remove
    { id: 'test-1', title: 'test 1', updatedAt: Date.now() - 86400000 },
    { id: 'test-2', title: 'test 2', updatedAt: Date.now() - 3600000 },
  ]);
  const [activeId, setActiveId] = React.useState<string | null>(
    history.length ? history[0].id : null,
  );

  const newChat = () => {
    const id = `c_${Date.now()}`;
    const item: SidebarHistoryItem = {
      id,
      title: 'New chat',
      updatedAt: Date.now(),
    };
    setHistory((h) => [item, ...h]);
    setActiveId(id);
    setMessages([]);
    setInput('');
  };
  const onSettings = () => {
    // stub: wire later
  };
  const onSearch = () => {
    // stub: wire later
  };
  const onLibrary = () => {
    // stub: wire later
  };
  const onNewProject = () => {
    // stub: wire later
  };
  const onSelectHistory = (id: string) => {
    setActiveId(id);
    // In a real app, load that chat’s messages here
    setMessages([]);
  };
  const handleHistoryAction = (
    action: 'rename' | 'move' | 'archive' | 'delete',
    id: string,
  ) => {
    if (action === 'delete') {
      setHistory((h) => h.filter((x) => x.id !== id));
      if (activeId === id) setActiveId(null);
      return;
    }
    if (action === 'archive') {
      setHistory((h) =>
        h.map((x) => (x.id === id ? { ...x, archived: true } : x)),
      );
      return;
    }
    if (action === 'rename') {
      setHistory((h) =>
        h.map((x) => (x.id === id ? { ...x, title: `${x.title} (renamed)` } : x)),
      );
      return;
    }
    // move: no-op placeholder
  };

  // === Chat state & API =========================================================
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Version banner (confirms API liveness)
  const [version, setVersion] = React.useState<{
    version?: string;
    commit?: string;
    builtAt?: string;
    meta?: { path?: string; tag?: string };
  }>({});

  React.useEffect(() => {
    // Non-blocking: confirm /api/version works in prod
    (async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setVersion(data);
        }
      } catch {
        // ignore; footer just won’t show build info
      }
    })();
  }, []);

  async function sendChat() {
    if (!input.trim()) return;
    setSending(true);
    setError(null);
    const next: ChatMsg[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(next);
    setInput('');

    try {
      // Basic OpenAI-style payload; adjust if your /api/chat expects a different shape
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Chat API ${res.status} ${res.statusText} ${txt}`);
      }

      const data = await res.json().catch(() => ({} as any));
      // Expect either { content: string } or OpenAI-like { choices: [{ message: { content } }] }
      const content =
        data?.content ??
        data?.choices?.[0]?.message?.content ??
        'No content returned.';

      setMessages((m) => [...m, { role: 'assistant', content }]);
    } catch (err: any) {
      setError(err?.message || 'Failed to reach /api/chat.');
      // keep UX moving; append a soft failure message
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content:
            'I hit a snag talking to `/api/chat`. Version endpoint is working; please check the chat handler or keys.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  // Enter-to-send
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  // === Layout ==================================================================
  return (
    <>
      {/* App grid (fixed sidebar on md+, main scrolls) */}
      <div className="min-h-[100dvh] overflow-x-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-[100dvh]">
          {/* Sidebar */}
          <Sidebar
            history={history}
            onNewChat={newChat}
            onSettings={onSettings}
            onSearch={onSearch}
            onLibrary={onLibrary}
            onNewProject={onNewProject}
            activeId={activeId}
            onSelectHistory={onSelectHistory}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            onHistoryAction={handleHistoryAction}
          />

          {/* Main */}
          <section className="main h-[100dvh] overflow-y-auto bg-[#fafbfc]">
            <div className="header">
              <div className="header-inner">
                <button
                  className="btn"
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Toggle sidebar"
                  style={{ marginRight: 8 }}
                >
                  Menu
                </button>
                <div style={{ fontWeight: 700 }}>Chat</div>
                {/* Right-side header space left intentionally minimal */}
                <div className="controls" />
              </div>
            </div>

            {/* Chat composer */}
            <div className="p-4 md:p-6">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  maxWidth: 900,
                  margin: '0 auto',
                  paddingTop: 8,
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask about DTI, PMI, or where rates sit vs the 10-year | …"
                  className="rounded-full px-5 py-3 border outline-none"
                  aria-label="Ask a question"
                />
                <button
                  onClick={sendChat}
                  disabled={sending}
                  className="btn rounded-full px-4 py-3"
                  aria-label="Send"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>

              {/* Error line (if any) */}
              {error && (
                <div
                  className="mt-3 text-sm"
                  style={{
                    color: '#b00020',
                    maxWidth: 900,
                    margin: '0 auto',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Messages */}
              <div
                className="mt-6"
                style={{
                  maxWidth: 900,
                  margin: '0 auto',
                  display: 'grid',
                  gap: 12,
                }}
              >
                {messages.length === 0 ? (
                  <div
                    style={{
                      opacity: 0.7,
                      fontSize: 14,
                      textAlign: 'center',
                      padding: '24px 0',
                    }}
                  >
                    Ask a question to get started.
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background:
                          m.role === 'user' ? '#ffffff' : 'white',
                        border: '1px solid #e6e8eb',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#6b7280',
                          marginBottom: 6,
                          textTransform: 'uppercase',
                          letterSpacing: 0.3,
                        }}
                      >
                        {m.role}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Footer (version banner) */}
            <footer
              className="border-t"
              style={{
                padding: '12px 16px',
                marginTop: 12,
                background: '#f6f8fb',
              }}
            >
              <div
                style={{
                  maxWidth: 900,
                  margin: '0 auto',
                  fontSize: 13,
                  textAlign: 'center',
                  color: '#6b7280',
                }}
              >
                HomeRates.Ai — Powered by OpenAI
                {version?.builtAt ? (
                  <>
                    {' '}
                    • {new Date(version.builtAt).toLocaleString()}
                  </>
                ) : null}
                {version?.commit ? (
                  <>
                    {' '}
                    • Version{' '}
                    <Link
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      title={version.commit}
                    >
                      {String(version.commit).slice(0, 7)}
                    </Link>
                  </>
                ) : null}
              </div>
            </footer>
          </section>
        </div>
      </div>
    </>
  );
}
