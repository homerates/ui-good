'use client';
import AppNav from './AppNav';
import { useConsumerMode } from '@/useConsumerMode';

/**
 * Role + hostname-aware nav wrapper. Uses useConsumerMode() which combines
 * hostname detection (homerates.ai = consumer) with Supabase role verification
 * (borrower = consumer, lo/agent = pro).
 *
 * fullNav=false (default): drawerOnly — just hamburger + drawer, no top bar.
 * fullNav=true: pro domain → full top bar + pro drawer;
 *               consumer → drops to drawerOnly + consumer drawer.
 */
export default function ConsumerNav({ fullNav = false }: { fullNav?: boolean }) {
  const isConsumer = useConsumerMode();

  return (
    <AppNav
      drawerOnly={!fullNav || isConsumer}
      consumer={isConsumer}
    />
  );
}
