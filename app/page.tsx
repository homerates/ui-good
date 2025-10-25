'use client';
import Link from "next/link";
import { useEffect, useRef, useState } from 'react';

type Role = 'user' | 'assistant';

type ApiResponse = {
  path: 'concept' | 'market' | 'dynamic' | 'error';
  usedFRED: boolean;

  // Friendly lines from API
  message?: string;
  summary?: string;

  tldr?: string[];
  lockBias?: 'Mild Lock' | 'Neutral' | 'Float Watch';
  answer?: string;
  borrowerSummary?: string | null;
  fred?: {
    tenYearYield: number | null;
    mort30Avg: number | null;
    spread: number | null;
    asOf?: string | null;
  };
  paymentDelta?: { perQuarterPt: number; loanAmount: number };
  watchNext?: string[];
  confidence?: 'low' | 'med' | 'high';
  status?: number;
};

/* -------------------------------------------------------------------
   Extended AnswersResponse type for /api/answers (includes generatedAt)
------------------------------------------------------------------- */
type AnswersResponse = {
  ok: boolean;
  route: "answers";
  intent: string;
  tag: string;
  usedFRED?: boolean;
  generatedAt?: string;            // ← NEW
  market?: {
    type: "market";
    asOf?: string;
    tenYearYield?: number | null;
    mort30Avg?: number | null;
    spread?: number | null;
    tone?: string;
    text?: string;
  } | { type: "market"; error: string };
};

/* -------------------------------------------------------------------
   Chat message types
------------------------------------------------------------------- */
type ChatMsg =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; meta?: ApiResponse };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}
