'use client';

import { useEffect, useState } from 'react';

type Json = unknown;

export default function ProbePage() {
  const [answers, setAnswers] = useState<Json>(null);
  const [fred, setFred] = useState<Json>(null);
  const [when, setWhen] = useState<string>("");

  useEffect(() => {
    setWhen(new Date().toISOString());
    // GET mirrors POST in your current answers route
    fetch('/api/answers', { cache: 'no-store' })
      .then(r => r.json())
      .then(setAnswers)
      .catch(e => setAnswers({ error: String(e) }));

    fetch('/api/fred', { cache: 'no-store' })
      .then(r => r.json())
      .then(setFred)
      .catch(e => setFred({ error: String(e) }));
  }, []);

  return (
    <main style={{ padding: 20, display: 'grid', gap: 16 }}>
      <h1>Probe</h1>
      <div style={{ fontSize: 12, opacity: 0.8 }}>loadedAt: {when}</div>

      <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          /api/answers (GET, no-store)
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(answers, null, 2)}
        </pre>
      </section>

      <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          /api/fred (GET, no-store)
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(fred, null, 2)}
        </pre>
      </section>
    </main>
  );
}
