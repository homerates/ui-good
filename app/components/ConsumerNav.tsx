'use client';
import { useState, useEffect } from 'react';
import AppNav from './AppNav';

/**
 * Hostname-aware nav wrapper. Detects homerates.ai (consumer domain) at runtime
 * and switches AppNav to consumer drawer links. Works in both server and client components.
 *
 * fullNav=false (default): drawerOnly mode — just hamburger + drawer, no top bar.
 * fullNav=true: on pro domain shows full top bar + pro drawer; on consumer domain
 *               drops to drawerOnly + consumer drawer (hides professional top links).
 */
export default function ConsumerNav({ fullNav = false }: { fullNav?: boolean }) {
  const [isConsumer, setIsConsumer] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    setIsConsumer(h === 'homerates.ai' || h === 'www.homerates.ai');
  }, []);

  return (
    <AppNav
      drawerOnly={!fullNav || isConsumer}
      consumer={isConsumer}
    />
  );
}
