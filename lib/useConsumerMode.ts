'use client';
import { useEffect, useState } from 'react';

/**
 * Returns true when the current session is a consumer context.
 *
 * Primary signal: hostname (homerates.ai = consumer, chat.homerates.ai = pro).
 * Secondary signal: fetched role from /api/profile — borrower = consumer,
 * lo/agent = pro. The role can override the hostname for edge cases (e.g. a
 * borrower who lands on chat.homerates.ai via a direct link).
 *
 * Starts as `false` (SSR safe) and flips after the first client-side effect.
 */
export function useConsumerMode(): boolean {
  const [isConsumer, setIsConsumer] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    const hostConsumer = h === 'homerates.ai' || h === 'www.homerates.ai';

    // Fast path: hostname is decisive for most users
    setIsConsumer(hostConsumer);

    // Role check: fetch lightweight profile to confirm
    // lo/agent on homerates.ai → still pro (unlikely but possible)
    // borrower on chat.homerates.ai → consumer (wrong domain, show consumer chrome)
    fetch('/api/profile', { method: 'GET', credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { role?: string } | null) => {
        if (!data?.role) return; // unauthenticated or error — keep hostname signal
        const role = data.role;
        if (role === 'lo' || role === 'agent' || role === 'admin') {
          setIsConsumer(false); // always pro regardless of domain
        } else if (role === 'borrower') {
          setIsConsumer(true);  // always consumer regardless of domain
        }
      })
      .catch(() => { /* keep hostname signal on fetch error */ });
  }, []);

  return isConsumer;
}
