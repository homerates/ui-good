// Stage 1 of the shell migration — single source of truth for every nav item.
// Not yet consumed by any renderer; Stage 2 shells will filter from this array.
// See ARCHITECTURE_DECISIONS.md AD-7.

export type NavMode    = 'consumer' | 'pro';
export type NavGroup   = 'decide' | 'tools' | 'mine' | 'learn' | 'account';
export type NavSurface = 'desktop' | 'drawer' | 'chatPanel';

export interface NavItem {
  id: string;
  href: string;
  label: string;
  labelByMode?: Partial<Record<NavMode, string>>;
  icon: string;
  group: NavGroup;
  modes: NavMode[];
  surfaces: NavSurface[];
  proBadge?: boolean;
  adminOnly?: boolean;
  footer?: boolean;
  subLabel?: string;
}

export const NAV_ITEMS: NavItem[] = [

  // ── DECIDE ───────────────────────────────────────────────────────────────────
  // Primary surfaces in the desktop center bar + drawer + chatPanel.
  // /chat replaces the D5 "AI Chat" + "Scenario Engine" split (same href, one entry).
  {
    id: 'chat',
    href: '/chat',
    label: 'Chat',
    icon: '💬',
    group: 'decide',
    modes: ['consumer', 'pro'],
    surfaces: ['desktop', 'drawer', 'chatPanel'],
  },
  {
    id: 'market-intelligence',
    href: '/market-intelligence',
    label: 'Market Rates',
    icon: '📈',
    group: 'decide',
    modes: ['consumer', 'pro'],
    surfaces: ['desktop', 'drawer', 'chatPanel'],
  },
  {
    id: 'my-home',
    href: '/my-home',
    label: 'My Home',
    icon: '🏠',
    group: 'decide',
    modes: ['consumer'],
    surfaces: ['desktop', 'drawer', 'chatPanel'],
    subLabel: 'Your property intelligence hub',
  },
  {
    id: 'check-property',
    href: '/check-property',
    label: 'Check Property',
    icon: '🔍',
    group: 'decide',
    modes: ['consumer'],
    surfaces: ['drawer', 'chatPanel'],
    subLabel: 'Full property intelligence report',
  },
  {
    id: 'track5',
    href: '/track5',
    label: 'Track 5',
    icon: '🎯',
    group: 'decide',
    modes: ['consumer'],
    surfaces: ['drawer', 'chatPanel'],
    subLabel: 'Your buyer decision score',
  },
  {
    id: 'homeowner',
    href: '/homeowner',
    label: 'Home Value',
    icon: '🏡',
    group: 'decide',
    modes: ['pro'],
    surfaces: ['drawer', 'chatPanel'],
    subLabel: 'Estimate & refi readiness',
  },

  // ── TOOLS ────────────────────────────────────────────────────────────────────
  // Previously absent from all six definitions; wired here for Phase B.
  {
    id: 'rate-intelligence-engine',
    href: '/rate-intelligence-engine',
    label: 'Rate Intelligence',
    icon: '🔬',
    group: 'tools',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },
  {
    id: 'ami-qualifier',
    href: '/ami-qualifier',
    label: 'AMI Qualifier',
    icon: '🟩',
    group: 'tools',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },
  // Icon resolved: 📍 chosen over 🏠 (clearer for a limit/threshold concept).
  // Year suffix "2026" dropped — label is static, routes correctly regardless.
  {
    id: 'loan-limits',
    href: '/loan-limits',
    label: 'Loan Limits',
    icon: '📍',
    group: 'tools',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },
  {
    id: 'calculators',
    href: '/calculators',
    label: 'Calculators',
    icon: '🧮',
    group: 'tools',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },

  // ── MINE ─────────────────────────────────────────────────────────────────────
  // Label drift resolved: labelByMode carries the per-role label.
  // Default label is 'My Library'; pro override 'My Vault' applied at render time.
  // Icon resolved: 🗂 used for both (existing D1/D3 convention for pro).
  {
    id: 'library',
    href: '/library',
    label: 'My Library',
    labelByMode: { pro: 'My Vault', consumer: 'My Library' },
    icon: '🗂',
    group: 'mine',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },
  {
    id: 'messages',
    href: '/messages',
    label: 'Messages',
    icon: '✉️',
    group: 'mine',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },
  // Fixes I7: /dashboard was absent from D5 (chat pro panel). Tagged chatPanel here.
  {
    id: 'dashboard',
    href: '/dashboard',
    label: 'Dashboard',
    icon: '⚡',
    group: 'mine',
    modes: ['pro'],
    surfaces: ['desktop', 'drawer', 'chatPanel'],
  },
  // Consumer-side: /connect ("Share with Pro") — distinct from pro /connect/my-scenario.
  {
    id: 'connect-consumer',
    href: '/connect',
    label: 'Share with Pro',
    icon: '📤',
    group: 'mine',
    modes: ['consumer'],
    surfaces: ['drawer', 'chatPanel'],
    subLabel: 'Send your scenario to a lender',
  },
  // Pro-side: /connect/my-scenario — different route, different intent.
  {
    id: 'my-scenario',
    href: '/connect/my-scenario',
    label: 'My Scenario',
    icon: '🎯',
    group: 'mine',
    modes: ['pro'],
    surfaces: ['drawer', 'chatPanel'],
  },
  {
    id: 'deal-rooms',
    href: '/deal-rooms',
    label: 'Deal Rooms',
    icon: '🤝',
    group: 'mine',
    modes: ['pro'],
    surfaces: ['drawer', 'chatPanel'],
    proBadge: true,
  },
  {
    id: 'investor',
    href: '/investor',
    label: 'Investor Portal',
    icon: '📊',
    group: 'mine',
    modes: ['pro'],
    surfaces: ['drawer'],
  },

  // ── LEARN ────────────────────────────────────────────────────────────────────
  {
    id: 'lab',
    href: '/lab',
    label: 'HomeRates Lab',
    icon: '🧪',
    group: 'learn',
    modes: ['pro'],
    surfaces: ['drawer', 'chatPanel'],
    subLabel: 'Policy & guideline answers',
  },
  {
    id: 'knowledge-hub',
    href: '/knowledge-hub',
    label: 'Knowledge Hub',
    icon: '📚',
    group: 'learn',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },
  // /platform: icon 🧠 per spec. Resolves I3 (🧠 vs 🔬 drift — 🧠 chosen; two of
  // three prior occurrences used 🧠, one used 🔬 in D5).
  // Fixes I8: /platform now tagged chatPanel for consumer (was absent from D6).
  {
    id: 'platform',
    href: '/platform',
    label: 'Platform Intelligence',
    icon: '🧠',
    group: 'learn',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },
  {
    id: 'market-news',
    href: '/market-news',
    label: 'Market News',
    icon: '📰',
    group: 'learn',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
  },

  // ── ACCOUNT (footer: true) ───────────────────────────────────────────────────
  // These live in the persistent drawer footer section, not an intent group.
  // chatPanel surface: flagged uncertain — profile/support not currently in D5/D6.
  // Tagged here so Stage 2 renderers can decide whether to include them; easy to
  // drop chatPanel from these two entries if not wanted.
  {
    id: 'profile',
    href: '/profile',
    label: 'My Profile',
    icon: '👤',
    group: 'account',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
    footer: true,
  },
  {
    id: 'support',
    href: '/support',
    label: 'Support',
    icon: '❓',
    group: 'account',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer', 'chatPanel'],
    footer: true,
  },
  {
    id: 'settings',
    href: '/settings',
    label: 'Settings',
    icon: '⚙️',
    group: 'account',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer'],
    footer: true,
  },
  // Sign-out is a Clerk action — Stage 2 renderer detects id==='sign-out' and calls
  // signOut() rather than navigating to this href.
  {
    id: 'sign-out',
    href: '/sign-out',
    label: 'Sign Out',
    icon: '🚪',
    group: 'account',
    modes: ['consumer', 'pro'],
    surfaces: ['drawer'],
    footer: true,
  },
  // Admin: drawer only — never chatPanel; rendered only when isAdmin gate passes.
  {
    id: 'admin',
    href: '/admin',
    label: 'Admin',
    icon: '🔴',
    group: 'account',
    modes: ['pro'],
    surfaces: ['drawer'],
    adminOnly: true,
    footer: true,
  },

];
