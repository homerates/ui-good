'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppNav from '../../components/AppNav';
import { useAdminStatus } from '../../hooks/useAdminStatus';

interface Partner {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  tagline: string | null;
  accent_color: string;
  contact_email: string | null;
  active: boolean;
  created_at: string;
}

const BLANK: Omit<Partner, 'id' | 'created_at' | 'active'> = {
  slug: '', name: '', logo_url: '', tagline: '', accent_color: '#00e87a', contact_email: '',
};

export default function WhiteLabelAdmin() {
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [partners, setPartners]   = useState<Partner[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [form,     setForm]       = useState({ ...BLANK });
  const [editing,  setEditing]    = useState<string | null>(null);
  const [saving,   setSaving]     = useState(false);
  const [msg,      setMsg]        = useState('');
  const [copied,   setCopied]     = useState<string | null>(null);

  useEffect(() => {
    if (!adminLoading && !isAdmin) router.push('/');
  }, [isAdmin, adminLoading, router]);

  useEffect(() => { if (isAdmin) fetchPartners(); }, [isAdmin]);

  async function fetchPartners() {
    setLoading(true);
    const res = await fetch('/api/admin/white-label');
    const j   = await res.json();
    setPartners(j.partners ?? []);
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true); setMsg('');
    const method = editing ? 'PATCH' : 'POST';
    const url    = editing ? `/api/admin/white-label?slug=${editing}` : '/api/admin/white-label';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-') }),
    });
    const j = await res.json();
    if (j.ok) {
      setMsg(editing ? '✓ Updated' : '✓ Partner created');
      setForm({ ...BLANK });
      setEditing(null);
      fetchPartners();
    } else {
      setMsg(`Error: ${j.error}`);
    }
    setSaving(false);
  }

  async function toggleActive(slug: string, active: boolean) {
    await fetch(`/api/admin/white-label?slug=${slug}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    });
    fetchPartners();
  }

  async function deletePartner(slug: string) {
    if (!confirm(`Delete partner "${slug}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/white-label?slug=${slug}`, { method: 'DELETE' });
    fetchPartners();
  }

  function startEdit(p: Partner) {
    setEditing(p.slug);
    setForm({ slug: p.slug, name: p.name, logo_url: p.logo_url ?? '', tagline: p.tagline ?? '', accent_color: p.accent_color, contact_email: p.contact_email ?? '' });
  }

  function copyUrl(slug: string) {
    const url = `${window.location.origin}/instant?partner=${slug}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  }

  if (adminLoading || !isAdmin) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#f0f4ff', fontSize: '0.85rem', padding: '9px 12px',
    fontFamily: 'inherit', outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: '#4b6080', marginBottom: 5, display: 'block',
  };

  return (
    <div className="page-standalone" style={{ background: '#080c12', minHeight: '100vh', color: '#c4cfe0', fontFamily: 'system-ui,sans-serif' }}>
      <AppNav />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4b6080', marginBottom: 8 }}>
            Admin · White Label
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f0f4ff', letterSpacing: '-0.02em', marginBottom: 6 }}>
            White-Label Partners
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#4b6080', lineHeight: 1.6 }}>
            Each partner gets a branded <code style={{ fontFamily: 'monospace', fontSize: '0.78em', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4 }}>/instant?partner=slug</code> URL showing their logo and name instead of HomeRates.
          </p>
        </div>

        {/* Form */}
        <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '24px', marginBottom: 32 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 20 }}>
            {editing ? `Editing: ${editing}` : 'Add new white-label partner'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Partner Slug *</label>
              <input style={inputStyle} placeholder="groves-capital"
                value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                disabled={!!editing} />
              <div style={{ fontSize: '0.6rem', color: '#3a4560', marginTop: 4 }}>URL: /instant?partner=<em>{form.slug || 'slug'}</em></div>
            </div>
            <div>
              <label style={labelStyle}>Display Name *</label>
              <input style={inputStyle} placeholder="Groves Capital"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Logo URL</label>
              <input style={inputStyle} placeholder="https://groves.com/logo.png"
                value={form.logo_url ?? ''} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Accent Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.accent_color}
                  onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
                  style={{ width: 40, height: 38, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                <input style={{ ...inputStyle, flex: 1 }} placeholder="#00e87a"
                  value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Tagline (optional)</label>
              <input style={inputStyle} placeholder="Let Us Welcome You Home"
                value={form.tagline ?? ''} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Contact Email (optional)</label>
              <input style={inputStyle} placeholder="support@groves.com"
                value={form.contact_email ?? ''} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
            <button onClick={handleSave} disabled={saving || !form.slug || !form.name}
              style={{ background: '#00e87a', color: '#060d0a', border: 'none', borderRadius: 9, padding: '10px 22px', fontSize: '0.85rem', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : editing ? '✓ Save Changes' : '+ Add Partner'}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setForm({ ...BLANK }); setMsg(''); }}
                style={{ background: 'rgba(255,255,255,0.04)', color: '#8fa3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 18px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            )}
            {msg && <span style={{ fontSize: '0.78rem', color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{msg}</span>}
          </div>
        </div>

        {/* Partner list */}
        {loading ? (
          <div style={{ color: '#4b6080', fontSize: '0.82rem' }}>Loading partners…</div>
        ) : partners.length === 0 ? (
          <div style={{ color: '#3a4560', fontSize: '0.82rem' }}>No white-label partners configured yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {partners.map(p => (
              <div key={p.id} style={{ background: '#0d1117', border: `1px solid ${p.active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, opacity: p.active ? 1 : 0.55 }}>
                {/* Accent swatch */}
                <div style={{ width: 8, height: 40, borderRadius: 4, background: p.accent_color, flexShrink: 0 }} />

                {/* Logo preview */}
                {p.logo_url ? (
                  <img src={p.logo_url} alt={p.name} style={{ height: 32, maxWidth: 80, objectFit: 'contain', flexShrink: 0 }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div style={{ width: 40, height: 32, background: 'rgba(255,255,255,0.04)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#3a4560', flexShrink: 0 }}>no logo</div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0' }}>{p.name}</span>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', background: p.active ? 'rgba(0,232,122,0.1)' : 'rgba(255,255,255,0.04)', color: p.active ? '#00e87a' : '#4b6080', border: `1px solid ${p.active ? 'rgba(0,232,122,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase' }}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#4b6080', fontFamily: 'monospace' }}>/instant?partner={p.slug}</div>
                  {p.tagline && <div style={{ fontSize: '0.68rem', color: '#4b6080', marginTop: 2 }}>{p.tagline}</div>}
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => copyUrl(p.slug)}
                    style={{ background: 'rgba(0,232,122,0.07)', color: '#00e87a', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 7, padding: '7px 14px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {copied === p.slug ? '✓ Copied' : '🔗 Copy URL'}
                  </button>
                  <button onClick={() => startEdit(p)}
                    style={{ background: 'rgba(255,255,255,0.04)', color: '#8fa3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 14px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Edit
                  </button>
                  <button onClick={() => toggleActive(p.slug, p.active)}
                    style={{ background: 'rgba(255,255,255,0.03)', color: '#4b6080', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '7px 14px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {p.active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deletePartner(p.slug)}
                    style={{ background: 'rgba(248,113,113,0.07)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 7, padding: '7px 14px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
