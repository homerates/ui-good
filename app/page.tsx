'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/nextjs';

export default function LandingPage() {
  const router = useRouter();
  const [cmdInput, setCmdInput] = useState('');
  const [propInput, setPropInput] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const cmdRef = useRef<HTMLInputElement>(null);

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

    const track = document.getElementById('ticker-track');
    if (track) {
      const html = tickerData.map(d =>
        `<div class="lp-ticker-item">
          <span class="lp-ticker-label">${d.label}</span>
          <span class="lp-ticker-val">${d.val}</span>
          <span class="lp-ticker-chg lp-ticker-${d.dir}">${d.chg}</span>
        </div>`
      ).join('');
      track.innerHTML = html + html;
    }

    // TYPING PLACEHOLDER
    const phrases = [
      "What's my payment on an $832,750 home with 10% down?",
      "Can I afford a $900k home on $180k salary in California?",
      "Does FHA allow bank statement income?",
      "What's my break-even if I refi at 5.75%?",
      "DSCR on a $650k rental with $4,200/mo rent in SoCal",
    ];

    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const input = document.getElementById('hero-input') as HTMLInputElement | null;

    function typeLoop() {
      if (!input) return;
      const current = phrases[phraseIndex];
      if (!deleting) {
        input.placeholder = current.substring(0, charIndex + 1);
        charIndex++;
        if (charIndex === current.length) {
          deleting = true;
          timer = setTimeout(typeLoop, 2200);
          return;
        }
      } else {
        input.placeholder = current.substring(0, charIndex - 1);
        charIndex--;
        if (charIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
        }
      }
      timer = setTimeout(typeLoop, deleting ? 28 : 52);
    }

    timer = setTimeout(typeLoop, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <style>{`
        /* Landing page scoped styles — prefixed lp- to avoid conflicts */
        .lp-root {
          --bg: #080c12;
          --surface: #0e1420;
          --surface2: #141b28;
          --border: rgba(255,255,255,0.07);
          --border-bright: rgba(255,255,255,0.13);
          --text: #f0f4ff;
          --text-muted: #8fa3b8;
          --text-dim: #eaf8f7;
          --green: #00e87a;
          --green-dim: rgba(0,232,122,0.12);
          --green-glow: rgba(0,232,122,0.25);
          --blue: #3d8bff;
          --blue-dim: rgba(61,139,255,0.12);
          --orange: #ff8c42;
          --purple: #a78bfa;
          --red: #ff5f5f;
          font-family: 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          overflow-x: hidden;
        }

        .lp-root * { box-sizing: border-box; }

        /* Hide the layout footer on the landing page */
        body:has(.lp-root) .app-footer { display: none; }

        /* Noise overlay */
        .lp-noise {
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.4;
        }

        /* DATA BAR */
        .lp-data-bar {
          position: relative;
          z-index: 10;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          height: 36px;
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .lp-data-bar-label {
          flex-shrink: 0;
          padding: 0 16px;
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          font-weight: 500;
          color: var(--green);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border-right: 1px solid var(--border);
          height: 100%;
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--surface);
        }
        .lp-data-bar-label::before {
          content: '';
          width: 6px;
          height: 6px;
          background: var(--green);
          border-radius: 50%;
          animation: lp-pulse 2s infinite;
        }
        .lp-ticker-wrap { overflow: hidden; flex: 1; }
        .lp-ticker-track {
          display: flex;
          animation: lp-ticker 28s linear infinite;
        }
        .lp-ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 28px;
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          white-space: nowrap;
          border-right: 1px solid var(--border);
          height: 36px;
        }
        .lp-ticker-label { color: var(--text-muted); }
        .lp-ticker-val { color: var(--text); font-weight: 500; }
        .lp-ticker-chg { font-size: 10px; }
        .lp-ticker-up { color: var(--red); }
        .lp-ticker-dn { color: var(--green); }
        .lp-ticker-neu { color: var(--text-muted); }

        @keyframes lp-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes lp-fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* NAV */
        .lp-nav {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 40px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
        }
        .lp-nav-logo {
          display: flex;
          align-items: center;
          text-decoration: none;
        }
        .lp-nav-logo img {
          height: 36px;
          width: auto;
        }
        .lp-nav-links { display: flex; gap: 32px; list-style: none; align-items: center; }
        .lp-nav-links a {
          font-size: 13px;
          color: var(--text-muted);
          text-decoration: none;
          transition: color 0.2s;
          letter-spacing: 0.02em;
        }
        .lp-nav-links a:hover { color: var(--text); }

        /* Resources dropdown */
        .lp-nav-dropdown { position: relative; }
        .lp-nav-dropdown-trigger {
          display: flex; align-items: center; gap: 5px;
          font-size: 13px; font-family: 'DM Sans', sans-serif;
          color: var(--text-muted); background: none; border: none;
          cursor: pointer; padding: 0; letter-spacing: 0.02em;
          transition: color 0.2s;
        }
        .lp-nav-dropdown-trigger:hover { color: var(--text); }
        .lp-nav-dropdown-trigger:hover .lp-nav-dropdown-arrow { transform: rotate(180deg); }
        .lp-nav-dropdown-arrow { transition: transform 0.2s; display: inline-block; font-size: 10px; opacity: 0.6; }
        .lp-nav-dropdown-menu {
          display: none;
          position: absolute; top: 100%; left: 50%;
          transform: translateX(-50%);
          min-width: 220px;
          padding-top: 12px; /* visual gap — keeps hover alive while crossing */
          z-index: 100;
        }
        .lp-nav-dropdown-menu-inner {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 6px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          display: flex; flex-direction: column;
        }
        .lp-nav-dropdown:hover .lp-nav-dropdown-menu { display: block; }
        .lp-nav-dropdown-menu-inner a {
          font-size: 13px; color: var(--text-muted);
          text-decoration: none; padding: 9px 14px;
          border-radius: 8px; transition: background 0.15s, color 0.15s;
          display: flex; align-items: center; gap: 10px;
          letter-spacing: 0.02em;
        }
        .lp-nav-dropdown-menu-inner a:hover { background: rgba(255,255,255,0.05); color: var(--text); }
        .lp-nav-dropdown-menu .lp-ddm-icon { font-size: 15px; width: 20px; text-align: center; }
        .lp-nav-dropdown-divider { height: 1px; background: var(--border); margin: 4px 8px; }

        .lp-nav-cta { display: flex; align-items: center; gap: 12px; }
        .lp-btn-ghost {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          color: var(--text-muted);
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px 16px;
          text-decoration: none;
          transition: color 0.2s;
          display: inline-block;
        }
        .lp-btn-ghost:hover { color: var(--text); }
        .lp-btn-primary {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #000;
          background: var(--green);
          border: none;
          cursor: pointer;
          padding: 9px 20px;
          border-radius: 6px;
          text-decoration: none;
          display: inline-block;
          transition: opacity 0.2s, transform 0.15s;
        }
        .lp-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }

        /* HERO */
        .lp-hero {
          position: relative;
          z-index: 1;
          padding: 80px 40px 60px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .lp-hero::before {
          content: '';
          position: absolute;
          top: -100px;
          left: 50%;
          transform: translateX(-50%);
          width: 700px;
          height: 500px;
          background: radial-gradient(ellipse, rgba(0,232,122,0.05) 0%, transparent 70%);
          pointer-events: none;
        }
        .lp-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          color: var(--green);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 28px;
          padding: 6px 14px;
          border: 1px solid rgba(0,232,122,0.25);
          border-radius: 100px;
          background: var(--green-dim);
          animation: lp-fadeUp 0.6s ease forwards;
        }
        .lp-headline {
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(42px, 6vw, 80px);
          font-weight: 800;
          line-height: 1.0;
          letter-spacing: -0.03em;
          margin-bottom: 24px;
          max-width: 820px;
          animation: lp-fadeUp 0.6s 0.1s ease both;
        }
        .lp-headline-green { color: var(--green); display: block; }
        .lp-sub {
          font-size: 17px;
          font-weight: 300;
          color: var(--text-muted);
          max-width: 520px;
          line-height: 1.65;
          margin-bottom: 48px;
          animation: lp-fadeUp 0.6s 0.2s ease both;
        }
        .lp-sub strong { color: var(--text); font-weight: 500; }

        /* COMMAND BAR */
        .lp-cmd-wrap {
          max-width: 760px;
          margin-bottom: 16px;
          animation: lp-fadeUp 0.6s 0.3s ease both;
        }
        .lp-cmd-bar {
          display: flex;
          align-items: center;
          background: var(--surface2);
          border: 1px solid var(--border-bright);
          border-radius: 14px;
          padding: 4px 4px 4px 20px;
          gap: 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lp-cmd-bar:focus-within {
          border-color: rgba(0,232,122,0.4);
          box-shadow: 0 0 0 4px var(--green-glow);
        }
        .lp-cmd-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          color: var(--text);
          padding: 14px 0;
        }
        .lp-cmd-input::placeholder { color: rgba(143,163,184,0.45); }
        .lp-cmd-send {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          background: var(--green);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s;
          text-decoration: none;
        }
        .lp-cmd-send:hover { opacity: 0.85; }
        .lp-cmd-hint {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: rgba(143,163,184,0.65);
          letter-spacing: 0.08em;
          padding-left: 4px;
          margin-top: 8px;
        }

        /* CHIPS */
        .lp-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 64px;
          max-width: 760px;
          animation: lp-fadeUp 0.6s 0.45s ease both;
        }
        .lp-chip {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          color: var(--text-muted);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 6px 14px;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
          text-decoration: none;
          display: inline-block;
          box-sizing: border-box;
        }
        .lp-chip:hover {
          color: var(--text);
          border-color: var(--border-bright);
          background: var(--surface2);
        }

        /* PROPERTY SEARCH */
        .lp-prop-wrap {
          max-width: 760px;
          margin-bottom: 72px;
          animation: lp-fadeUp 0.6s 0.45s ease both;
        }
        .lp-prop-label {
          font-family: 'DM Mono', monospace;
          font-size: 9px;
          font-weight: 500;
          color: rgba(143,163,184,0.7);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .lp-prop-bar {
          display: flex;
          align-items: center;
          background: var(--surface2);
          border: 1px solid var(--border-bright);
          border-radius: 12px;
          padding: 4px 4px 4px 16px;
          gap: 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lp-prop-bar:focus-within {
          border-color: rgba(61,139,255,0.4);
          box-shadow: 0 0 0 4px rgba(61,139,255,0.12);
        }
        .lp-prop-icon { color: rgba(143,163,184,0.5); flex-shrink: 0; display: flex; align-items: center; }
        .lp-prop-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: var(--text);
          padding: 13px 0;
        }
        .lp-prop-input::placeholder { color: rgba(143,163,184,0.45); }
        .lp-prop-btn {
          flex-shrink: 0;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: var(--blue);
          background: rgba(61,139,255,0.1);
          border: 1px solid rgba(61,139,255,0.2);
          border-radius: 8px;
          padding: 9px 16px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
          text-decoration: none;
        }
        .lp-prop-btn:hover { background: rgba(61,139,255,0.18); border-color: rgba(61,139,255,0.4); }
        .lp-prop-hint {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: rgba(143,163,184,0.6);
          letter-spacing: 0.06em;
          margin-top: 8px;
          padding-left: 4px;
        }

        /* LIVE INSIGHT */
        .lp-insight {
          display: flex;
          align-items: center;
          gap: 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-left: 3px solid var(--green);
          border-radius: 10px;
          padding: 14px 20px;
          max-width: 760px;
          margin-bottom: 80px;
          animation: lp-fadeUp 0.6s 0.45s ease both;
        }
        .lp-insight-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--green);
          flex-shrink: 0;
          animation: lp-pulse 2s infinite;
        }
        .lp-insight-text { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
        .lp-insight-text strong { color: var(--text); font-weight: 500; }

        /* SCENARIO CARDS */
        .lp-section-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          font-weight: 500;
          color: rgba(143,163,184,0.65);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        .lp-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 80px;
        }
        .lp-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 24px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
          text-decoration: none;
          display: block;
          text-align: left;
          width: 100%;
          box-sizing: border-box;
          font-family: inherit;
        }
        .lp-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .lp-card:hover {
          border-color: var(--border-bright);
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        }
        .lp-card:hover::before { opacity: 1; }
        .lp-card-green::before { background: var(--green); }
        .lp-card-blue::before { background: var(--blue); }
        .lp-card-orange::before { background: var(--orange); }
        .lp-card-purple::before { background: var(--purple); }
        .lp-card-red::before { background: var(--red); }
        .lp-card-icon { font-size: 22px; margin-bottom: 14px; display: block; }
        .lp-card-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px; font-weight: 600;
          color: var(--text); margin-bottom: 6px;
        }
        .lp-card-insight { font-size: 12px; font-weight: 500; margin-bottom: 8px; }
        .lp-card-green .lp-card-insight { color: var(--green); }
        .lp-card-blue .lp-card-insight { color: var(--blue); }
        .lp-card-orange .lp-card-insight { color: var(--orange); }
        .lp-card-purple .lp-card-insight { color: var(--purple); }
        .lp-card-red .lp-card-insight { color: var(--red); }
        .lp-card-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

        /* INTELLIGENCE SECTION */
        .lp-intel { max-width: 1200px; margin: 0 auto 100px; padding: 0 40px; }
        .lp-intel-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: center;
        }
        .lp-intel-left h2 {
          font-family: 'DM Sans', sans-serif;
          font-size: clamp(28px, 3.5vw, 44px);
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.02em;
          margin-bottom: 20px;
        }
        .lp-intel-left h2 em { font-style: normal; color: var(--green); }
        .lp-intel-left p {
          font-size: 15px; color: var(--text-muted);
          line-height: 1.7; margin-bottom: 32px; max-width: 420px;
        }
        .lp-pillars { display: flex; flex-direction: column; gap: 16px; }
        .lp-pillar { display: flex; align-items: flex-start; gap: 14px; }
        .lp-pillar-icon {
          width: 32px; height: 32px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; flex-shrink: 0;
        }
        .lp-pillar-icon-g { background: var(--green-dim); }
        .lp-pillar-icon-b { background: var(--blue-dim); }
        .lp-pillar-icon-o { background: rgba(255,140,66,0.12); }
        .lp-pillar-text strong { display: block; font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 2px; }
        .lp-pillar-text span { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

        /* MOCK CHAT WINDOW */
        .lp-chat-window {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
        }
        .lp-chat-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border);
          background: var(--surface2);
        }
        .lp-chat-dots { display: flex; gap: 6px; }
        .lp-dot { width: 10px; height: 10px; border-radius: 50%; }
        .lp-chat-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text-dim); letter-spacing: 0.1em; }
        .lp-chat-msgs { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
        .lp-msg-user {
          align-self: flex-end;
          max-width: 85%; font-size: 13px; line-height: 1.55;
          background: var(--green-dim);
          border: 1px solid rgba(0,232,122,0.2);
          color: var(--text);
          padding: 10px 14px;
          border-radius: 12px 12px 2px 12px;
        }
        .lp-msg-ai { align-self: flex-start; color: var(--text-muted); max-width: 85%; }
        .lp-msg-ai-label { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--text-dim); letter-spacing: 0.1em; margin-bottom: 6px; }
        .lp-msg-ai-card {
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 16px;
        }
        .lp-card-num { font-family: 'DM Sans', sans-serif; font-size: 22px; font-weight: 700; color: var(--green); margin-bottom: 2px; }
        .lp-card-sub { font-size: 11px; color: var(--text-muted); }
        .lp-card-row {
          display: flex; justify-content: space-between;
          font-size: 11px; color: var(--text-muted);
          padding: 8px 0; border-top: 1px solid var(--border); margin-top: 10px;
        }
        .lp-card-row span:last-child { color: var(--text); }

        /* STATS BAR */
        .lp-stats {
          background: var(--surface);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 60px 40px;
          margin-bottom: 80px;
        }
        .lp-stats-inner { max-width: 1200px; margin: 0 auto; }
        .lp-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; }
        .lp-stat { text-align: center; }
        .lp-stat-num { font-family: 'DM Sans', sans-serif; font-size: 36px; font-weight: 800; color: var(--green); margin-bottom: 4px; }
        .lp-stat-label { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 6px; }
        .lp-stat-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

        /* FOOTER */
        .lp-footer {
          max-width: 1200px; margin: 0 auto;
          padding: 40px;
          display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid var(--border);
        }
        .lp-footer-left { font-size: 12px; color: var(--text-muted); line-height: 1.6; max-width: 480px; }
        .lp-footer-links { display: flex; gap: 24px; }
        .lp-footer-links a { font-size: 12px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
        .lp-footer-links a:hover { color: var(--text); }

        /* MOBILE HAMBURGER BUTTON */
        /* Hamburger — always visible (replaces Open chat on desktop) */
        .lp-nav-ham {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 5px;
          background: none;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          cursor: pointer;
          padding: 9px 11px;
          width: 40px; height: 40px;
          box-sizing: border-box;
          transition: border-color 0.15s, background 0.15s;
        }
        .lp-nav-ham:hover { border-color: rgba(0,232,122,0.4); background: rgba(0,232,122,0.05); }
        .lp-nav-ham span {
          display: block; width: 100%; height: 2px;
          background: rgba(255,255,255,0.7); border-radius: 2px;
          transition: background 0.15s;
        }
        .lp-nav-ham:hover span { background: #00e87a; }
        /* Legacy class — keep for any stale references */
        .lp-mobile-ham { display: none; }

        /* RIGHT SIDEBAR MENU + OVERLAY */
        .lp-menu-overlay {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 498;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
        }
        .lp-menu-overlay.lp-menu-open { display: block; }
        .lp-mobile-menu {
          display: none;
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 300px;
          max-width: 88vw;
          z-index: 499;
          background: #0d1117;
          flex-direction: column;
          overflow: hidden;
          box-shadow: -8px 0 48px rgba(0,0,0,0.6);
          border-left: 1px solid rgba(255,255,255,0.07);
        }
        .lp-mobile-menu.lp-menu-open { display: flex; }
        .lp-mobile-menu-head {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .lp-mobile-menu-close {
          flex-shrink: 0;
          background: none;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-muted);
          font-size: 18px;
          padding: 5px 11px;
          line-height: 1;
          transition: border-color 0.15s, color 0.15s;
        }
        .lp-mobile-menu-close:hover { border-color: rgba(255,255,255,0.3); color: #f0f4ff; }
        .lp-mobile-menu-body {
          flex: 1;
          overflow-y: auto;
          padding-bottom: 24px;
        }
        .lp-mobile-menu-section-label {
          font-family: 'DM Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.18em;
          color: rgba(143,163,184,0.5);
          text-transform: uppercase;
          padding: 20px 24px 8px;
        }
        .lp-mobile-menu-link {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 15px 24px;
          font-size: 15px;
          font-weight: 500;
          color: var(--text);
          text-decoration: none;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          transition: background 0.15s;
        }
        .lp-mobile-menu-link:active,
        .lp-mobile-menu-link:hover { background: rgba(255,255,255,0.04); }
        .lp-mobile-menu-link-icon { font-size: 17px; width: 24px; text-align: center; flex-shrink: 0; }
        .lp-mobile-menu-link-sub { font-size: 12px; color: var(--text-muted); font-weight: 400; margin-top: 1px; }
        .lp-mobile-menu-link-inner { display: flex; flex-direction: column; }
        .lp-mobile-menu-ctas {
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          border-top: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
        }
        .lp-mobile-menu-cta-primary {
          display: block;
          width: 100%;
          padding: 14px;
          background: var(--green);
          color: #000;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 700;
          text-align: center;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          text-decoration: none;
        }
        .lp-mobile-menu-cta-ghost {
          display: block;
          width: 100%;
          padding: 13px;
          background: none;
          color: var(--text-muted);
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 500;
          text-align: center;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          cursor: pointer;
          text-decoration: none;
        }

        /* MOBILE */
        @media (max-width: 768px) {
          .lp-nav { padding: 14px 20px; }
          .lp-nav-links { display: none; }
          .lp-btn-ghost { display: none; }
          .lp-hero { padding: 40px 20px; }
          .lp-headline { font-size: 38px; }
          .lp-sub { font-size: 15px; margin-bottom: 32px; }
          .lp-chips, .lp-insight, .lp-prop-wrap { max-width: 100%; }
          .lp-chips { margin-bottom: 32px; }
          .lp-insight { margin-bottom: 48px; }
          .lp-prop-wrap { margin-bottom: 48px; }
          .lp-prop-btn { display: none; }
          .lp-cards-grid { grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 60px; }
          .lp-card { padding: 18px; }
          .lp-card-title { font-size: 13px; }
          .lp-intel { padding: 0 20px; margin-bottom: 60px; }
          .lp-intel-grid { grid-template-columns: 1fr; gap: 40px; }
          .lp-chat-window { display: none; }
          .lp-stats { padding: 48px 20px; }
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 28px; }
          .lp-footer { flex-direction: column; gap: 20px; padding: 32px 20px; text-align: center; }
          .lp-footer-left { font-size: 11px; }
          .lp-footer-links { justify-content: center; flex-wrap: wrap; gap: 16px; }
          .lp-footer-links a { font-size: 12px; }
        }
      `}</style>

      <div className="lp-root">
        <div className="lp-noise" />

        {/* DATA BAR */}
        <div className="lp-data-bar">
          <div className="lp-data-bar-label">LIVE</div>
          <div className="lp-ticker-wrap">
            <div className="lp-ticker-track" id="ticker-track" />
          </div>
        </div>

        {/* NAV */}
        <nav className="lp-nav">
          <Link href="/" className="lp-nav-logo">
            <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
          </Link>
          <ul className="lp-nav-links">
            <li><Link href="/chat">Open Chat</Link></li>
            <li><Link href="/chat">Scenario Engine</Link></li>
            <li><Link href="/lab">HomeRates Lab</Link></li>
            <li><Link href="/homeowner">Home Value</Link></li>
            <li className="lp-nav-dropdown">
              <button className="lp-nav-dropdown-trigger">
                Resources <span className="lp-nav-dropdown-arrow">▾</span>
              </button>
              <div className="lp-nav-dropdown-menu">
                <div className="lp-nav-dropdown-menu-inner">
                  <Link href="/market-news"><span className="lp-ddm-icon">📰</span>Market News</Link>
                  <Link href="/knowledge-hub"><span className="lp-ddm-icon">📚</span>Knowledge Hub</Link>
                  <Link href="/loan-limits"><span className="lp-ddm-icon">🏠</span>Loan Limits 2026</Link>
                  <div className="lp-nav-dropdown-divider" />
                  <Link href="/compare"><span className="lp-ddm-icon">⚖️</span>Compare Scenarios</Link>
                  <Link href="/calculators"><span className="lp-ddm-icon">🧮</span>Calculators</Link>
                  <Link href="/jumbo-calculator"><span className="lp-ddm-icon">⚡</span>Jumbo Calculator</Link>
                  <Link href="/dscr-calculator"><span className="lp-ddm-icon">📊</span>DSCR Calculator</Link>
                  <div className="lp-nav-dropdown-divider" />
                  <Link href="/platform"><span className="lp-ddm-icon">🔬</span>Platform Intelligence</Link>
                </div>
              </div>
            </li>
          </ul>
          <div className="lp-nav-cta">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="lp-btn-ghost">Sign in</button>
              </SignInButton>
              <Link href="/chat" className="lp-btn-primary">Try free</Link>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            {/* Hamburger — desktop (always) + mobile (signed out) */}
            <button className="lp-nav-ham" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
              <span /><span /><span />
            </button>
          </div>
        </nav>

        {/* Overlay behind right sidebar */}
        <div className={`lp-menu-overlay${mobileMenuOpen ? ' lp-menu-open' : ''}`} onClick={() => setMobileMenuOpen(false)} />

        {/* RIGHT SIDEBAR MENU */}
        <div className={`lp-mobile-menu${mobileMenuOpen ? ' lp-menu-open' : ''}`}>
          <div className="lp-mobile-menu-head">
            <button className="lp-mobile-menu-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">✕</button>
            <Link href="/" className="lp-nav-logo" onClick={() => setMobileMenuOpen(false)}>
              <img src="/assets/homerates-logo-horizontal.png" alt="HomeRates.ai" />
            </Link>
          </div>
          <div className="lp-mobile-menu-body">
            <Link href="/" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">🏠</span>
              <div className="lp-mobile-menu-link-inner">
                <span>Home</span>
                <span className="lp-mobile-menu-link-sub">HomeRates.ai</span>
              </div>
            </Link>
            <div className="lp-mobile-menu-section-label">Platform</div>
            <Link href="/chat" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">💬</span>
              <div className="lp-mobile-menu-link-inner">
                <span>AI Chat</span>
                <span className="lp-mobile-menu-link-sub">Ask any mortgage question</span>
              </div>
            </Link>
            <Link href="/chat" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">⚡</span>
              <div className="lp-mobile-menu-link-inner">
                <span>Scenario Engine</span>
                <span className="lp-mobile-menu-link-sub">Payment breakdowns & comparisons</span>
              </div>
            </Link>
            <Link href="/chat" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">🧠</span>
              <div className="lp-mobile-menu-link-inner">
                <span>HomeRates Lab</span>
                <span className="lp-mobile-menu-link-sub">Policy & guideline answers</span>
              </div>
            </Link>
            <Link href="/homeowner" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">🏡</span>
              <div className="lp-mobile-menu-link-inner">
                <span>Home Value</span>
                <span className="lp-mobile-menu-link-sub">Estimate & refi readiness</span>
              </div>
            </Link>
            <div className="lp-mobile-menu-section-label">Resources</div>
            <Link href="/market-news" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">📰</span>
              <div className="lp-mobile-menu-link-inner"><span>Market News</span></div>
            </Link>
            <Link href="/knowledge-hub" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">📚</span>
              <div className="lp-mobile-menu-link-inner"><span>Knowledge Hub</span></div>
            </Link>
            <Link href="/loan-limits" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">🏠</span>
              <div className="lp-mobile-menu-link-inner"><span>Loan Limits 2026</span></div>
            </Link>
            <Link href="/calculators" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">🧮</span>
              <div className="lp-mobile-menu-link-inner"><span>Calculators</span></div>
            </Link>
            <Link href="/compare" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">⚖️</span>
              <div className="lp-mobile-menu-link-inner"><span>Compare Scenarios</span></div>
            </Link>
            <Link href="/platform" className="lp-mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>
              <span className="lp-mobile-menu-link-icon">🔬</span>
              <div className="lp-mobile-menu-link-inner"><span>Platform Intelligence</span></div>
            </Link>
          </div>
          <div className="lp-mobile-menu-ctas">
            <Link href="/chat" className="lp-mobile-menu-cta-primary" onClick={() => setMobileMenuOpen(false)}>
              Try free — no sign up required
            </Link>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="lp-mobile-menu-cta-ghost" onClick={() => setMobileMenuOpen(false)}>Sign in</button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>

        {/* HERO */}
        <section className="lp-hero">
          <div className="lp-eyebrow">
            &#9679; <span style={{ opacity: 0.6 }}>First AI mortgage intelligence platform</span>
          </div>

          <h1 className="lp-headline">
            Your mortgage,<br />
            <span className="lp-headline-green">understood.</span>
          </h1>

          <p className="lp-sub">
            <strong>Real math. Live rates. No sales. No gatekeepers.</strong><br />
            Ask any mortgage question and get an instant, precise answer — backed by live market data, not guesswork.
          </p>

          {/* COMMAND BAR */}
          <div className="lp-cmd-wrap">
            <form className="lp-cmd-bar" onSubmit={handleCmdSubmit}>
              <input
                ref={cmdRef}
                className="lp-cmd-input"
                id="hero-input"
                placeholder="What's my payment on a $650k home with 20% down?"
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCmdSubmit(e as any); }}
                autoComplete="off"
              />
              <button type="submit" className="lp-cmd-send" aria-label="Ask">
                <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
            <div className="lp-cmd-hint">Try any scenario — no forms, no signups required</div>
          </div>

          {/* CHIPS — each pre-seeds the chat question */}
          <div className="lp-chips">
            <button className="lp-chip" onClick={() => goChat('Conventional loan with a $832,750 loan amount and 20% down at current rates — show me the full monthly payment breakdown')}>$832,750 · 20% down · conforming</button>
            <button className="lp-chip" onClick={() => goChat('Conventional loan with a $832,750 loan amount and 5% down — show me the full payment including PMI')}>$832,750 · 5% down · PMI?</button>
            <button className="lp-chip" onClick={() => goChat('FHA loan on a $700,000 home in Los Angeles with 3.5% down — show me the full payment breakdown including MIP')}>FHA · $700k LA · 3.5% down</button>
            <button className="lp-chip" onClick={() => goChat('I make $180,000 a year and have $90,000 saved — can I afford a $900,000 home in California?')}>Can I afford $900k on $180k?</button>
            <button className="lp-chip" onClick={() => goChat('DSCR loan on a $650,000 rental property with $4,200/mo rent and 25% down — does it cash flow in California?')}>DSCR rental · $650k · $4,200 rent</button>
            <button className="lp-chip" onClick={() => goChat('VA loan on an $850,000 home with no down payment — show me the full breakdown including funding fee')}>VA loan · $850k · $0 down</button>
            <button className="lp-chip" onClick={() => goChat('2/1 buydown on a $900,000 conventional purchase with 20% down at current rates — show me the year-by-year savings')}>2/1 buydown · $900k · 20% down</button>
          </div>

          {/* LIVE INSIGHT */}
          <div className="lp-insight">
            <div className="lp-insight-dot" />
            <div className="lp-insight-text">
              <strong>Rate alert:</strong> 30Y fixed is at 6.38% this week — that&apos;s <strong>$47/mo higher</strong> than 6 months ago on a $500k loan. A 1% rate drop saves you <strong>$297/mo</strong>.
            </div>
          </div>

          {/* PROPERTY SEARCH */}
          <div className="lp-prop-wrap">
            <div className="lp-prop-label">Property Lookup</div>
            <form className="lp-prop-bar" onSubmit={handlePropSubmit}>
              <div className="lp-prop-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <input
                className="lp-prop-input"
                placeholder="Paste a Redfin URL or enter an address — get instant refi analysis"
                value={propInput}
                onChange={(e) => setPropInput(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text').trim();
                  if (text.startsWith('http')) {
                    e.preventDefault();
                    setPropInput(text);
                    setTimeout(() => goChat(text), 50);
                  }
                }}
                autoComplete="off"
              />
              <button type="submit" className="lp-prop-btn" disabled={!propInput.trim()}>Analyze Property</button>
            </form>
            <div className="lp-prop-hint">Works on sold, pending, and off-market properties · Instant refi readiness · No account needed</div>
          </div>

          {/* SCENARIO CARDS */}
          <div className="lp-section-label">Live Scenarios</div>
          <div className="lp-cards-grid">
            <button className="lp-card lp-card-green" onClick={() => goChat('I make $180,000 a year and have $90,000 saved — how much house can I afford in California?')}>
              <span className="lp-card-icon">🏠</span>
              <div className="lp-card-title">Can I afford it?</div>
              <div className="lp-card-insight">~$850k–$950k range</div>
              <div className="lp-card-desc">~$4,800/mo on $180k salary · 36% DTI</div>
            </button>
            <button className="lp-card lp-card-blue" onClick={() => goChat('What would refinancing look like on a $750,000 California mortgage at 7.25%? Show me breakeven and monthly savings.')}>
              <span className="lp-card-icon">📉</span>
              <div className="lp-card-title">Should I refi?</div>
              <div className="lp-card-insight">~$510/mo savings</div>
              <div className="lp-card-desc">$750k CA balance · break-even analysis</div>
            </button>
            <button className="lp-card lp-card-orange" onClick={() => goChat('DSCR loan on a $650,000 rental property with $4,200/mo rent and 25% down — does it cash flow in California?')}>
              <span className="lp-card-icon">📊</span>
              <div className="lp-card-title">Cash flow check</div>
              <div className="lp-card-insight">DSCR ~1.08 — SoCal rental</div>
              <div className="lp-card-desc">$650k rental · $4,200/mo rent</div>
            </button>
            <button className="lp-card lp-card-purple" onClick={() => goChat('FHA loan on a $700,000 home in Los Angeles with 3.5% down — show me the full payment breakdown including MIP.')}>
              <span className="lp-card-icon">🏦</span>
              <div className="lp-card-title">FHA low down</div>
              <div className="lp-card-insight">3.5% down · $24,500 to close</div>
              <div className="lp-card-desc">$700k LA home · payment incl. MIP</div>
            </button>
            <button className="lp-card lp-card-red" onClick={() => goChat('VA loan on an $850,000 home with no down payment — show me the full breakdown including funding fee.')}>
              <span className="lp-card-icon">⭐</span>
              <div className="lp-card-title">VA — $0 down</div>
              <div className="lp-card-insight">No down · no PMI</div>
              <div className="lp-card-desc">$850k home · full breakdown</div>
            </button>
            <button className="lp-card lp-card-blue" onClick={() => goChat('Jumbo loan on a $1,500,000 home with 20% down — show me the full payment breakdown and reserve requirements.')}>
              <span className="lp-card-icon">🏛️</span>
              <div className="lp-card-title">Jumbo $1.5M</div>
              <div className="lp-card-insight">20% down · ~$8,900/mo</div>
              <div className="lp-card-desc">Reserves &amp; qualification guide</div>
            </button>
          </div>
        </section>

        {/* INTELLIGENCE SECTION */}
        <section className="lp-intel">
          <div className="lp-intel-grid">
            <div className="lp-intel-left">
              <h2>Not a calculator.<br />An <em>intelligence layer</em>.</h2>
              <p>Traditional mortgage sites make you fill out forms and wait for a call. HomeRates.ai answers the same questions a seasoned loan officer would — instantly, at any hour, with live market data.</p>
              <div className="lp-pillars">
                <div className="lp-pillar">
                  <div className="lp-pillar-icon lp-pillar-icon-g">💡</div>
                  <div className="lp-pillar-text">
                    <strong>Live FRED data — 22 series</strong>
                    <span>Rates, inflation, housing, treasury yields — updated weekly from the Federal Reserve.</span>
                  </div>
                </div>
                <div className="lp-pillar">
                  <div className="lp-pillar-icon lp-pillar-icon-b">🧠</div>
                  <div className="lp-pillar-text">
                    <strong>HomeRates Lab</strong>
                    <span>Policy questions answered by a reasoning model trained on FHA, conventional, and DSCR guidelines.</span>
                  </div>
                </div>
                <div className="lp-pillar">
                  <div className="lp-pillar-icon lp-pillar-icon-o">⚡</div>
                  <div className="lp-pillar-text">
                    <strong>Instant · No forms · No sales pitch</strong>
                    <span>Get a precise answer in seconds — no personal info required, no one to call you back.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* MOCK CHAT */}
            <div className="lp-chat-window">
              <div className="lp-chat-header">
                <div className="lp-chat-dots">
                  <div className="lp-dot" style={{ background: '#ff5f5f' }} />
                  <div className="lp-dot" style={{ background: '#ffbd44' }} />
                  <div className="lp-dot" style={{ background: '#00ca4e' }} />
                </div>
                <div className="lp-chat-label">HOMERATES.AI · LIVE</div>
                <div style={{ width: 52 }} />
              </div>
              <div className="lp-chat-msgs">
                <div className="lp-msg-user">$550k home, 20% down, what&apos;s my payment?</div>
                <div className="lp-msg-ai">
                  <div className="lp-msg-ai-label">HOMERATES.AI</div>
                  <div className="lp-msg-ai-card">
                    <div className="lp-card-num">$2,749/mo</div>
                    <div className="lp-card-sub">Principal &amp; Interest · 30yr fixed · 6.38%</div>
                    <div className="lp-card-row"><span>Loan amount</span><span>$440,000</span></div>
                    <div className="lp-card-row"><span>Down payment</span><span>$110,000 (20%)</span></div>
                    <div className="lp-card-row"><span>Total interest</span><span>$549,744</span></div>
                    <div className="lp-card-row"><span>LTV</span><span>80% — No PMI</span></div>
                  </div>
                </div>
                <div className="lp-msg-user">What if I put 10% down instead?</div>
                <div className="lp-msg-ai">
                  <div className="lp-msg-ai-label">HOMERATES.AI</div>
                  <div className="lp-msg-ai-card">
                    <div className="lp-card-num">$3,191/mo</div>
                    <div className="lp-card-sub">Includes PMI · 90% LTV · 6.38%</div>
                    <div className="lp-card-row"><span>PMI added</span><span>~$206/mo</span></div>
                    <div className="lp-card-row"><span>Extra cost vs 20%</span><span>+$442/mo</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <div className="lp-stats">
          <div className="lp-stats-inner">
            <div className="lp-stats-grid">
              <div className="lp-stat">
                <div className="lp-stat-num">&lt;2s</div>
                <div className="lp-stat-label">Average response</div>
                <div className="lp-stat-desc">From question to full breakdown — no loading spinner</div>
              </div>
              <div className="lp-stat">
                <div className="lp-stat-num">22</div>
                <div className="lp-stat-label">Live data series</div>
                <div className="lp-stat-desc">FRED-sourced rates, inflation, and housing metrics</div>
              </div>
              <div className="lp-stat">
                <div className="lp-stat-num">5</div>
                <div className="lp-stat-label">Loan modules</div>
                <div className="lp-stat-desc">Conventional, FHA, DSCR, Refi, and Affordability</div>
              </div>
              <div className="lp-stat">
                <div className="lp-stat-num">$0</div>
                <div className="lp-stat-label">To get started</div>
                <div className="lp-stat-desc">No credit check, no personal info, no callback</div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-footer-left">
            HomeRates.ai is an independent educational tool and is not a mortgage lender or broker. Educational only, not financial advice.
          </div>
          <div className="lp-footer-links">
            <Link href="/market-news">Market News</Link>
            <Link href="/knowledge-hub">Knowledge Hub</Link>
            <Link href="/loan-limits">Loan Limits 2026</Link>
            <Link href="/calculators">Calculators</Link>
            <Link href="/platform">Platform Intelligence</Link>
            <Link href="/disclosures">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
