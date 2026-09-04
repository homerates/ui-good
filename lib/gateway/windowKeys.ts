// lib/gateway/windowKeys.ts
//
// One canonical UTC window-key helper, used by every rate-limit/quota
// counter call -- never compute a window key ad hoc elsewhere.
//
// Date.prototype.toISOString() is always UTC by spec, regardless of the
// server's local timezone -- this is what makes these window keys stable
// across any deployment region without needing an explicit timezone
// conversion.

export type WindowType = 'minute' | 'day' | 'month';

export function utcWindowKey(windowType: WindowType, at: Date = new Date()): string {
  const iso = at.toISOString(); // e.g. "2026-09-02T21:15:33.123Z"
  switch (windowType) {
    case 'minute':
      return iso.slice(0, 16); // "2026-09-02T21:15"
    case 'day':
      return iso.slice(0, 10); // "2026-09-02"
    case 'month':
      return iso.slice(0, 7); // "2026-09"
  }
}
