'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import AddressAutocomplete from '../components/AddressAutocomplete';

export default function ConsumerHomePage() {
  const [cmdInput, setCmdInput] = useState('');
  const [scenarioInput, setScenarioInput] = useState('');
  const [propInput, setPropInput] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const cmdRef = useRef<HTMLInputElement>(null);

  // Opens chat on the same domain (homerates.ai/chat) — never crosses to chat.homerates.ai
  function goChat(q: string) {
    if (!q.trim()) return;
    window.open(
      '/chat?sq=' + encodeURIComponent(q.trim()) + '&from=%2F&fromLabel=Home',
      '_blank',
      'noopener,noreferrer',
    );
  }

  function handleCmdSubmit(e: React.FormEvent) {
    e.preventDefault();
    goChat(cmdInput || (cmdRef.current?.placeholder ?? ''));
  }

  function handleScenarioSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scenarioInput.trim()) return;
    goChat('Run my numbers: ' + scenarioInput.trim());
  }

  function handlePropSubmit(e: React.FormEvent) {
    e.preventDefault();
    goChat(propInput);
  }

  useEffect(() => {
    // TICKER
    const tickerData = [
      { label: '30Y FIXED', val: '6.38%', chg: '+0.04%', dir: 'up' },
      { label: 'FED FUNDS', val: '5.25%', chg: '—', dir: 'neu' },
      { label: '10Y TREASURY', val: '4.21%', chg: '-0.03%', dir: 'dn' },
      { label: 'INFLATION (CPI)', val: '3.2%', chg: '-0.1%', dir: 'dn' },
      { label: '15Y FIXED', val: '5.87%', chg: '+0.02%', dir: 'up' },
      { label: 'MEDIAN HOME PRICE', val: '$420,800', chg: '+2.1% YoY', dir: 'up' },
      { label: '5/1 ARM', val: '6.01%', chg: '+0.06%', dir: 'up' },
      { label: 'UNEMPLOYMENT', val: '3.7%', chg: '—', dir: 'neu' },
    ];
    const track = document.getElementById('ch-ticker-track');
    if (track) {
      const html = tickerData.map(d =>
        `<div class="ch-ticker-item">
          <span class="ch-ticker-label">${d.label}</span>
          <span class="ch-ticker-val">${d.val}</span>
          <span class="ch-ticker-chg ch-ticker-${d.dir}">${d.chg}</span>
        </div>`
      ).join('');
      track.innerHTML = html + html;
    }

    // TYPING PLACEHOLDER
    const phrases = [
      "What's my payment on an $832,750 home with 10% down?",
      "Can I afford a $900k home on $180k salary in California?",
      "What's my break-even if I refi at 5.75%?",
      "DSCR on a $650k rental with $4,200/mo rent in SoCal",
      "VA loan on $850k — $0 down — show me the full breakdown",
    ];
    let phraseIndex = 0, charIndex = 0, deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const input = document.getElementById('ch-hero-input') as HTMLInputElement | null;
    function typeLoop() {
      if (!input) return;
      const current = phrases[phraseIndex];
      if (!deleting) {
        input.placeholder = current.substring(0, charIndex + 1);
        charIndex++;
        if (charIndex === current.length) { deleting = true; timer = setTimeout(typeLoop, 2200); return; }
      } else {
        input.placeholder = current.substring(0, charIndex - 1);
        charIndex--;
        if (charIndex === 0) { deleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; }
      }
      timer = setTimeout(typeLoop, deleting ? 28 : 52);
    }
    timer = setTimeout(typeLoop, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <style>{`
        /* Consumer Homepage — ch- prefix */
        .ch-root {
          --bg: #080c12;
          --surface: #0e1420;
          --surface2: #141b28;
          --border: rgba(255,255,255,0.07);
          --border-bright: rgba(255,255,255,0.13);
          --text: #f0f4ff;
          --text-muted: #8fa3b8;
          --green: #00e87a;
          --green-dim: rgba(0,232,122,0.10);
          --green-glow: rgba(0,232,122,0.22);
          --blue: #3d8bff;
          --blue-dim: rgba(61,139,255,0.10);
          font-family: 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          overflow-x: hidden;
        }
        .ch-root * { box-sizing: border-box; }
        body:has(.ch-root) .app-footer { display: none; }

        .ch-noise {
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none; z-index: 0; opacity: 0.4;
        }

        /* TICKER */
        .ch-data-bar {
          position: relative; z-index: 10;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          height: 36px; display: flex; align-items: center; overflow: hidden;
        }
        .ch-data-bar-label {
          flex-shrink: 0; padding: 0 16px;
          font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500;
          color: var(--green); letter-spacing: 0.12em; text-transform: uppercase;
          border-right: 1px solid var(--border); height: 100%;
          display: flex; align-items: center; gap: 6px; background: var(--surface);
        }
        .ch-data-bar-label::before {
          content: ''; width: 6px; height: 6px; background: var(--green);
          border-radius: 50%; animation: ch-pulse 2s infinite;
        }
        .ch-ticker-wrap { overflow: hidden; flex: 1; }
        .ch-ticker-track { display: flex; animation: ch-ticker 28s linear infinite; }
        .ch-ticker-item {
          display: inline-flex; align-items: center; gap: 8px; padding: 0 28px;
          font-family: 'DM Mono', monospace; font-size: 11px;
          white-space: nowrap; border-right: 1px solid var(--border); height: 36px;
        }
        .ch-ticker-label { color: var(--text-muted); }
        .ch-ticker-val { color: var(--text); font-weight: 500; }
        .ch-ticker-chg { font-size: 10px; }
        .ch-ticker-up { color: #ff5f5f; }
        .ch-ticker-dn { color: var(--green); }
        .ch-ticker-neu { color: var(--text-muted); }

        @keyframes ch-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes ch-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes ch-fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

        /* NAV */
        .ch-nav {
          position: relative; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 40px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
        }
        .ch-nav-logo { display: flex; align-items: center; text-decoration: none; }
        .ch-nav-logo img { height: 36px; width: auto; }
        .ch-nav-links { display: flex; gap: 4px; list-style: none; align-items: center; }
        .ch-nav-links a, .ch-nav-dd-trigger {
          font-size: 13px; color: var(--text-muted); text-decoration: none;
          transition: color 0.2s; letter-spacing: 0.02em;
          padding: 7px 11px; border-radius: 8px;
          display: flex; align-items: center; gap: 4px;
        }
        .ch-nav-links a:hover, .ch-nav-dd-trigger:hover { color: var(--text); background: rgba(255,255,255,0.04); }
        .ch-nav-badge {
          font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          background: rgba(0,232,122,0.15); color: var(--green);
          border-radius: 4px; padding: 1px 5px; margin-left: 2px;
        }

        /* Dropdown */
        .ch-nav-dd { position: relative; }
        .ch-nav-dd-trigger {
          background: none; border: none; cursor: pointer;
          font-family: 'DM Sans', sans-serif;
        }
        .ch-nav-dd-arrow { font-size: 10px; opacity: 0.5; transition: transform 0.2s; }
        .ch-nav-dd-menu {
          display: none; position: absolute; top: 100%; left: 50%;
          transform: translateX(-50%); min-width: 210px; padding-top: 10px; z-index: 100;
        }
        .ch-nav-dd-inner {
          background: var(--bg); border: 1px solid var(--border);
          border-radius: 12px; padding: 6px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          display: flex; flex-direction: column;
        }
        .ch-nav-dd:hover .ch-nav-dd-menu { display: block; }
        .ch-nav-dd:hover .ch-nav-dd-arrow { transform: rotate(180deg); }
        .ch-nav-dd-inner a {
          font-size: 13px; color: var(--text-muted); text-decoration: none;
          padding: 9px 14px; border-radius: 8px;
          transition: background 0.15s, color 0.15s;
          display: flex; align-items: center; gap: 10px; letter-spacing: 0.02em;
        }
        .ch-nav-dd-inner a:hover { background: rgba(255,255,255,0.05); color: var(--text); }
        .ch-ddm-icon { font-size: 14px; width: 20px; text-align: center; }
        .ch-nav-dd-divider { height: 1px; background: var(--border); margin: 4px 8px; }

        .ch-nav-cta { display: flex; align-items: center; gap: 10px; }
        .ch-btn-ghost {
          font-family: 'DM Sans', sans-serif; font-size: 13px; color: var(--text-muted);
          background: none; border: none; cursor: pointer;
          padding: 8px 14px; text-decoration: none; transition: color 0.2s; display: inline-block;
        }
        .ch-btn-ghost:hover { color: var(--text); }
        .ch-btn-primary {
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600;
          color: #000; background: var(--green); border: none; cursor: pointer;
          padding: 9px 20px; border-radius: 8px; text-decoration: none;
          display: inline-block; transition: opacity 0.2s, transform 0.15s;
        }
        .ch-btn-primary:hover { opacity: 0.88; transform: translateY(-1px); }
        .ch-nav-ham {
          display: flex; flex-direction: column; justify-content: center;
          gap: 5px; background: none; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px; cursor: pointer; padding: 9px 11px;
          width: 40px; height: 40px; box-sizing: border-box;
          transition: border-color 0.15s, background 0.15s;
        }
        .ch-nav-ham:hover { border-color: rgba(0,232,122,0.4); background: rgba(0,232,122,0.05); }
        .ch-nav-ham span { display: block; width: 100%; height: 2px; background: rgba(255,255,255,0.7); border-radius: 2px; }
        .ch-nav-ham:hover span { background: #00e87a; }

        /* RIGHT SIDEBAR MENU */
        .ch-menu-overlay {
          display: none; position: fixed; inset: 0; z-index: 498;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(2px);
        }
        .ch-menu-overlay.open { display: block; }
        .ch-mobile-menu {
          display: none; position: fixed; top: 0; right: 0; bottom: 0;
          width: 300px; max-width: 88vw; z-index: 499;
          background: #0d1117; flex-direction: column; overflow: hidden;
          box-shadow: -8px 0 48px rgba(0,0,0,0.6);
          border-left: 1px solid rgba(255,255,255,0.07);
        }
        .ch-mobile-menu.open { display: flex; }
        .ch-mm-head {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0;
        }
        .ch-mm-close {
          flex-shrink: 0; background: none; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; cursor: pointer; color: var(--text-muted);
          font-size: 18px; padding: 5px 11px; line-height: 1; transition: border-color 0.15s;
        }
        .ch-mm-body { flex: 1; overflow-y: auto; padding-bottom: 24px; }
        .ch-mm-section {
          font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.18em;
          color: rgba(143,163,184,0.5); text-transform: uppercase; padding: 20px 24px 8px;
        }
        .ch-mm-link {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 24px; font-size: 15px; font-weight: 500;
          color: var(--text); text-decoration: none;
          border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;
        }
        .ch-mm-link:hover { background: rgba(255,255,255,0.04); }
        .ch-mm-icon { font-size: 17px; width: 24px; text-align: center; flex-shrink: 0; }
        .ch-mm-sub { font-size: 12px; color: var(--text-muted); font-weight: 400; margin-top: 1px; }
        .ch-mm-inner { display: flex; flex-direction: column; }
        .ch-mm-ctas {
          padding: 20px 24px; display: flex; flex-direction: column; gap: 10px;
          border-top: 1px solid rgba(255,255,255,0.07); flex-shrink: 0;
        }
        .ch-mm-cta-primary {
          display: block; width: 100%; padding: 14px; background: var(--green);
          color: #000; font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 700;
          text-align: center; border: none; border-radius: 10px; cursor: pointer; text-decoration: none;
        }
        .ch-mm-cta-ghost {
          display: block; width: 100%; padding: 13px; background: none;
          color: var(--text-muted); font-family: 'DM Sans', sans-serif; font-size: 15px;
          font-weight: 500; text-align: center;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
          cursor: pointer; text-decoration: none;
        }

        /* HERO */
        .ch-hero {
          position: relative; z-index: 1;
          padding: 72px 40px 48px; max-width: 1200px; margin: 0 auto;
        }
        .ch-hero::before {
          content: ''; position: absolute; top: -80px; left: 50%;
          transform: translateX(-50%); width: 700px; height: 480px;
          background: radial-gradient(ellipse, rgba(0,232,122,0.045) 0%, transparent 70%);
          pointer-events: none;
        }
        .ch-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500;
          color: var(--green); letter-spacing: 0.14em; text-transform: uppercase;
          margin-bottom: 28px; padding: 6px 14px;
          border: 1px solid rgba(0,232,122,0.25); border-radius: 100px;
          background: var(--green-dim); animation: ch-fadeUp 0.6s ease forwards;
        }
        .ch-headline {
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(42px, 6vw, 78px); font-weight: 800;
          line-height: 1.0; letter-spacing: -0.03em;
          margin-bottom: 20px; max-width: 820px;
          animation: ch-fadeUp 0.6s 0.08s ease both;
        }
        .ch-headline-green { color: var(--green); display: block; }
        .ch-sub {
          font-size: 17px; font-weight: 300; color: var(--text-muted);
          max-width: 500px; line-height: 1.65; margin-bottom: 48px;
          animation: ch-fadeUp 0.6s 0.16s ease both;
        }
        .ch-sub strong { color: var(--text); font-weight: 500; }

        /* TWO INSTANT CARDS */
        .ch-instant-row {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          max-width: 760px; margin-bottom: 20px;
          animation: ch-fadeUp 0.6s 0.22s ease both;
        }
        .ch-ic {
          background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 18px 20px; cursor: default;
          transition: border-color 0.15s, transform 0.15s; position: relative; overflow: hidden;
        }
        .ch-ic::before {
          content: ''; position: absolute; inset: 0; opacity: 0; transition: opacity 0.2s;
          pointer-events: none;
        }
        .ch-ic.green::before { background: radial-gradient(ellipse at 0% 0%, rgba(0,232,122,0.08), transparent 65%); }
        .ch-ic.blue::before  { background: radial-gradient(ellipse at 0% 0%, rgba(61,139,255,0.08), transparent 65%); }
        .ch-ic:hover::before { opacity: 1; }
        .ch-ic:hover { transform: translateY(-1px); }
        .ch-ic.green:hover { border-color: rgba(0,232,122,0.22); }
        .ch-ic.blue:hover  { border-color: rgba(61,139,255,0.22); }
        .ch-ic-tag {
          font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 600;
          letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px;
        }
        .ch-ic-tag.green { color: var(--green); }
        .ch-ic-tag.blue  { color: #60a5fa; }
        .ch-ic-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
        .ch-ic-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 12px; }
        .ch-ic-row { display: flex; gap: 6px; align-items: center; }
        .ch-ic-input {
          flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 9px; padding: 9px 12px; font-size: 12.5px;
          color: rgba(143,163,184,0.5); outline: none; font-family: 'DM Sans', sans-serif;
          transition: border-color 0.15s, color 0.15s;
        }
        .ch-ic-input::placeholder { color: rgba(143,163,184,0.38); }
        .ch-ic-input:focus { border-color: rgba(0,232,122,0.3); color: var(--text); }
        .ch-ic-input.blue:focus { border-color: rgba(61,139,255,0.35); }
        .ch-ic-go {
          width: 32px; height: 32px; border-radius: 8px; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; flex-shrink: 0; transition: opacity 0.15s, transform 0.15s;
        }
        .ch-ic-go.green { background: var(--green); color: #080c12; }
        .ch-ic-go.blue  { background: #3b82f6; color: #fff; }
        .ch-ic-go:hover { opacity: 0.85; transform: scale(1.06); }

        /* COMMAND BAR */
        .ch-cmd-wrap { max-width: 760px; margin-bottom: 14px; animation: ch-fadeUp 0.6s 0.28s ease both; }
        .ch-cmd-bar {
          display: flex; align-items: center;
          background: var(--surface2); border: 1px solid var(--border-bright);
          border-radius: 14px; padding: 4px 4px 4px 20px; gap: 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .ch-cmd-bar:focus-within {
          border-color: rgba(0,232,122,0.38);
          box-shadow: 0 0 0 4px var(--green-glow);
        }
        .ch-cmd-input {
          flex: 1; background: none; border: none; outline: none;
          font-family: 'DM Sans', sans-serif; font-size: 15px; color: var(--text); padding: 14px 0;
        }
        .ch-cmd-input::placeholder { color: rgba(143,163,184,0.4); }
        .ch-cmd-send {
          flex-shrink: 0; width: 44px; height: 44px; background: var(--green);
          border: none; border-radius: 10px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: opacity 0.2s;
        }
        .ch-cmd-send:hover { opacity: 0.85; }
        .ch-cmd-hint {
          font-family: 'DM Mono', monospace; font-size: 10px;
          color: rgba(143,163,184,0.55); letter-spacing: 0.08em; padding-left: 4px; margin-top: 8px;
        }

        /* CHIPS */
        .ch-chips {
          display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 64px;
          max-width: 760px; animation: ch-fadeUp 0.6s 0.36s ease both;
        }
        .ch-chip {
          font-family: 'DM Sans', sans-serif; font-size: 12px; color: var(--text-muted);
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 100px; padding: 6px 14px; cursor: pointer;
          transition: all 0.15s; white-space: nowrap;
        }
        .ch-chip:hover { color: var(--text); border-color: var(--border-bright); background: var(--surface2); }

        /* FEATURE TILES */
        .ch-features { max-width: 1200px; margin: 0 auto 80px; padding: 0 40px; }
        .ch-features-label {
          font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500;
          color: rgba(143,163,184,0.55); letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 20px;
        }
        .ch-features-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .ch-feat {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; padding: 22px; cursor: pointer;
          transition: all 0.18s; text-decoration: none; display: block;
          position: relative; overflow: hidden;
        }
        .ch-feat::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0;
          height: 2px; opacity: 0; transition: opacity 0.2s;
        }
        .ch-feat:hover { border-color: var(--border-bright); transform: translateY(-2px); box-shadow: 0 10px 36px rgba(0,0,0,0.28); }
        .ch-feat:hover::before { opacity: 1; }
        .ch-feat.g::before { background: var(--green); }
        .ch-feat.b::before { background: var(--blue); }
        .ch-feat.p::before { background: #a78bfa; }
        .ch-feat.o::before { background: #ff8c42; }
        .ch-feat-icon { font-size: 22px; margin-bottom: 12px; display: block; }
        .ch-feat-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 5px; }
        .ch-feat-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

        /* FOOTER */
        .ch-footer {
          max-width: 1200px; margin: 0 auto;
          padding: 36px 40px;
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid var(--border);
        }
        .ch-footer-left { font-size: 12px; color: var(--text-muted); line-height: 1.6; max-width: 480px; }
        .ch-footer-links { display: flex; gap: 22px; }
        .ch-footer-links a { font-size: 12px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
        .ch-footer-links a:hover { color: var(--text); }

        /* MOBILE */
        @media (max-width: 768px) {
          .ch-nav { padding: 14px 20px; }
          .ch-nav-links { display: none; }
          .ch-btn-ghost { display: none; }
          .ch-hero { padding: 40px 20px 36px; }
          .ch-headline { font-size: 38px; }
          .ch-sub { font-size: 15px; margin-bottom: 32px; }
          .ch-instant-row { grid-template-columns: 1fr; }
          .ch-chips { max-width: 100%; margin-bottom: 40px; }
          .ch-features { padding: 0 20px; margin-bottom: 56px; }
          .ch-features-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
          .ch-footer { flex-direction: column; gap: 20px; padding: 28px 20px; text-align: center; }
          .ch-footer-links { justify-content: center; flex-wrap: wrap; gap: 16px; }
        }
      `}</style>

      <div className="ch-root">
        <div className="ch-noise" />

        {/* TICKER */}
        <div className="ch-data-bar">
          <div className="ch-data-bar-label">LIVE</div>
          <div className="ch-ticker-wrap">
            <div className="ch-ticker-track" id="ch-ticker-track" />
          </div>
        </div>

        {/* NAV */}
        <nav className="ch-nav">
          <Link href="/" className="ch-nav-logo">
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>

          <ul className="ch-nav-links">
            <li><Link href="/chat?new=1">New Chat</Link></li>
            <li><Link href="/my-home">My Home <span className="ch-nav-badge">NEW</span></Link></li>
            <li><Link href="/chat?new=1&pl=1">Property Lookup</Link></li>
            <li><Link href="/market-intelligence">Market Rates</Link></li>
            <li className="ch-nav-dd">
              <button className="ch-nav-dd-trigger">
                Tools <span className="ch-nav-dd-arrow">▾</span>
              </button>
              <div className="ch-nav-dd-menu">
                <div className="ch-nav-dd-inner">
                  <Link href="/calculators"><span className="ch-ddm-icon">🧮</span>Calculators</Link>
                  <Link href="/loan-limits"><span className="ch-ddm-icon">📍</span>Loan Limits 2026</Link>
                  <Link href="/lab"><span className="ch-ddm-icon">🧪</span>HomeRates Lab</Link>
                </div>
              </div>
            </li>
            <li className="ch-nav-dd">
              <button className="ch-nav-dd-trigger">
                Resources <span className="ch-nav-dd-arrow">▾</span>
              </button>
              <div className="ch-nav-dd-menu">
                <div className="ch-nav-dd-inner">
                  <Link href="/knowledge-hub"><span className="ch-ddm-icon">📚</span>Knowledge Hub</Link>
                  <Link href="/market-news"><span className="ch-ddm-icon">📰</span>Market News</Link>
                  <div className="ch-nav-dd-divider" />
                  <Link href="/library"><span className="ch-ddm-icon">📁</span>My Library</Link>
                </div>
              </div>
            </li>
          </ul>

          <div className="ch-nav-cta">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="ch-btn-ghost">Sign in</button>
              </SignInButton>
              <Link href="/chat?new=1" className="ch-btn-primary">Try free</Link>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <button className="ch-nav-ham" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
              <span /><span /><span />
            </button>
          </div>
        </nav>

        {/* OVERLAY + SIDEBAR */}
        <div className={`ch-menu-overlay${mobileMenuOpen ? ' open' : ''}`} onClick={() => setMobileMenuOpen(false)} />
        <div className={`ch-mobile-menu${mobileMenuOpen ? ' open' : ''}`}>
          <div className="ch-mm-head">
            <button className="ch-mm-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
            <Link href="/" className="ch-nav-logo" onClick={() => setMobileMenuOpen(false)}>
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
            </Link>
          </div>
          <div className="ch-mm-body">
            <div className="ch-mm-section">My Account</div>
            <Link href="/my-home" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">🏠</span>
              <div className="ch-mm-inner"><span>My Home</span><span className="ch-mm-sub">Property value, equity & wealth</span></div>
            </Link>
            <Link href="/library" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">📁</span>
              <div className="ch-mm-inner"><span>My Library</span><span className="ch-mm-sub">Saved scenarios & reports</span></div>
            </Link>
            <div className="ch-mm-section">Explore</div>
            <Link href="/chat?new=1" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">💬</span>
              <div className="ch-mm-inner"><span>New Chat</span><span className="ch-mm-sub">Ask any home or mortgage question</span></div>
            </Link>
            <Link href="/chat?new=1&pl=1" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">🔍</span>
              <div className="ch-mm-inner"><span>Property Lookup</span><span className="ch-mm-sub">Enter an address — get full analysis</span></div>
            </Link>
            <Link href="/connect" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">📤</span>
              <div className="ch-mm-inner"><span>Share with Pro</span><span className="ch-mm-sub">Send your scenario privately</span></div>
            </Link>
            <Link href="/market-intelligence" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">📈</span>
              <div className="ch-mm-inner"><span>Market Rates</span><span className="ch-mm-sub">Live FRED data · Grok Oracle</span></div>
            </Link>
            <div className="ch-mm-section">Tools & Resources</div>
            <Link href="/calculators" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">🧮</span>
              <div className="ch-mm-inner"><span>Calculators</span></div>
            </Link>
            <Link href="/loan-limits" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">📍</span>
              <div className="ch-mm-inner"><span>Loan Limits 2026</span></div>
            </Link>
            <Link href="/knowledge-hub" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">📚</span>
              <div className="ch-mm-inner"><span>Knowledge Hub</span></div>
            </Link>
            <Link href="/market-news" className="ch-mm-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="ch-mm-icon">📰</span>
              <div className="ch-mm-inner"><span>Market News</span></div>
            </Link>
          </div>
          <div className="ch-mm-ctas">
            <Link href="/chat?new=1" className="ch-mm-cta-primary" onClick={() => setMobileMenuOpen(false)}>
              Try free — no sign up required
            </Link>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="ch-mm-cta-ghost" onClick={() => setMobileMenuOpen(false)}>Sign in</button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>

        {/* HERO */}
        <section className="ch-hero">
          {/* Badge — UPDATED */}
          <div className="ch-eyebrow">
            &#9679;&nbsp; First AI Home + Mortgage Intelligence Platform
          </div>

          {/* Headline — UPDATED */}
          <h1 className="ch-headline">
            Your Home + Mortgage,<br />
            <span className="ch-headline-green">understood.</span>
          </h1>

          <p className="ch-sub">
            <strong>Real math. Live rates. No sales. No gatekeepers.</strong><br />
            Ask any home or mortgage question and get an instant, precise answer — backed by live market data.
          </p>

          {/* TWO INSTANT CARDS */}
          <div className="ch-instant-row">
            <div className="ch-ic green">
              <div className="ch-ic-tag green">Instant Scenario</div>
              <div className="ch-ic-title">Run My Numbers</div>
              <div className="ch-ic-desc">Price, down payment, rate — see your full payment in seconds.</div>
              <form className="ch-ic-row" onSubmit={handleScenarioSubmit}>
                <input
                  className="ch-ic-input"
                  placeholder="$850k · 10% down · 6.48%"
                  value={scenarioInput}
                  onChange={(e) => setScenarioInput(e.target.value)}
                  autoComplete="off"
                />
                <button type="submit" className="ch-ic-go green">→</button>
              </form>
            </div>

            <div className="ch-ic blue">
              <div className="ch-ic-tag blue">Property Lookup</div>
              <div className="ch-ic-title">Check Any Property</div>
              <div className="ch-ic-desc">Address or Zillow/Redfin link — instant payment, value & score.</div>
              <form className="ch-ic-row" onSubmit={handlePropSubmit}>
                <AddressAutocomplete
                  className="ch-ic-input blue"
                  placeholder="Address or Zillow / Redfin link"
                  value={propInput}
                  onChange={(val) => {
                    setPropInput(val);
                    if (val.trim().startsWith('http')) {
                      setTimeout(() => { goChat(val.trim()); setPropInput(''); }, 50);
                    }
                  }}
                  onSelect={(val) => {
                    setPropInput(val);
                    setTimeout(() => { goChat(val); setPropInput(''); }, 50);
                  }}
                />
                <button type="submit" className="ch-ic-go blue">→</button>
              </form>
            </div>
          </div>

          {/* CHAT PILL */}
          <div className="ch-cmd-wrap">
            <form className="ch-cmd-bar" onSubmit={handleCmdSubmit}>
              <input
                ref={cmdRef}
                className="ch-cmd-input"
                id="ch-hero-input"
                placeholder="Ask any home or mortgage question…"
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className="ch-cmd-send" aria-label="Ask">
                <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
            <div className="ch-cmd-hint">No forms · No signups · No callbacks</div>
          </div>

          {/* CHIPS */}
          <div className="ch-chips">
            <button className="ch-chip" onClick={() => goChat('Conventional loan with a $832,750 loan amount and 20% down at current rates — show me the full monthly payment breakdown')}>$832,750 · 20% down · conforming</button>
            <button className="ch-chip" onClick={() => goChat('FHA loan on a $700,000 home in Los Angeles with 3.5% down — show me the full payment breakdown including MIP')}>FHA · $700k LA · 3.5% down</button>
            <button className="ch-chip" onClick={() => goChat('I make $180,000 a year and have $90,000 saved — can I afford a $900,000 home in California?')}>Can I afford $900k on $180k?</button>
            <button className="ch-chip" onClick={() => goChat('VA loan on an $850,000 home with no down payment — show me the full breakdown including funding fee')}>VA loan · $850k · $0 down</button>
            <button className="ch-chip" onClick={() => goChat('DSCR loan on a $650,000 rental property with $4,200/mo rent and 25% down — does it cash flow in California?')}>DSCR rental · $650k · $4,200 rent</button>
            <button className="ch-chip" onClick={() => goChat('What would refinancing look like on a $750,000 California mortgage at 6.75%? Show me breakeven and monthly savings.')}>Refi · $750k · 6.75% → today</button>
          </div>
        </section>

        {/* FEATURE TILES */}
        <section className="ch-features">
          <div className="ch-features-label">What you can do</div>
          <div className="ch-features-grid">
            <Link href="/my-home" className="ch-feat g">
              <span className="ch-feat-icon">🏠</span>
              <div className="ch-feat-title">My Home</div>
              <div className="ch-feat-desc">Track your property value, equity, and home wealth over time.</div>
            </Link>
            <Link href="/chat?new=1&pl=1" className="ch-feat b">
              <span className="ch-feat-icon">🔍</span>
              <div className="ch-feat-title">Property Lookup</div>
              <div className="ch-feat-desc">Instant payment, AVM value, and decision score on any property.</div>
            </Link>
            <Link href="/connect" className="ch-feat p">
              <span className="ch-feat-icon">📤</span>
              <div className="ch-feat-title">Share with Pro</div>
              <div className="ch-feat-desc">Send your scenario to a loan officer — privately. No cold calls.</div>
            </Link>
            <Link href="/market-intelligence" className="ch-feat o">
              <span className="ch-feat-icon">📈</span>
              <div className="ch-feat-title">Market Rates</div>
              <div className="ch-feat-desc">Live FRED rates, Grok Oracle analysis & rate alerts — know when to lock.</div>
            </Link>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="ch-footer">
          <div className="ch-footer-left">
            HomeRates.ai is an independent educational tool — not a mortgage lender or broker. Educational only, not financial advice.
          </div>
          <div className="ch-footer-links">
            <Link href="/knowledge-hub">Knowledge Hub</Link>
            <Link href="/market-news">Market News</Link>
            <Link href="/calculators">Calculators</Link>
            <Link href="/disclosures">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
