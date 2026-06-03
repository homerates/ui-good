/**
 * lib/logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight structured logger for server-side code.
 *
 * Why not console.log: unstructured output can't be parsed or filtered in
 * production; there's no level filtering; and error context is lost.
 *
 * Usage:
 *   import { log } from '@/lib/logger';
 *   log.warn('[PropertyLookup] Tavily failed', { address, error: e.message });
 *   log.error('[CalcEngine] Unexpected', { type, error: e.message, stack: e.stack });
 *
 * In production: swap the sink for a real logging service (Datadog, Axiom, etc.)
 * without touching any call site.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: Level;
    msg: string;
    ts: string;
    [key: string]: unknown;
}

function write(level: Level, msg: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
        level,
        msg,
        ts: new Date().toISOString(),
        ...context,
    };
    // Sink: stdout as JSON — replace with remote sink in production
    if (level === 'error') {
        console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
        console.warn(JSON.stringify(entry));
    } else {
        console.log(JSON.stringify(entry));
    }
}

export const log = {
    debug: (msg: string, ctx?: Record<string, unknown>) => write('debug', msg, ctx),
    info:  (msg: string, ctx?: Record<string, unknown>) => write('info',  msg, ctx),
    warn:  (msg: string, ctx?: Record<string, unknown>) => write('warn',  msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => write('error', msg, ctx),
};
