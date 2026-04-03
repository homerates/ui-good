// lib/content/topics.ts
// Rotating SEO topic seeds for the automated content engine.
// Each topic produces one article. The cron picks N topics per run,
// cycling through categories to avoid repetition.

export type ArticleCategory = 'knowledge-hub' | 'market-news';

export interface TopicSeed {
  category:    ArticleCategory;
  tag:         string;
  titleTemplate: string;   // may include {date}, {month}, {year}, {city}, {state}
  searchQuery: string;     // Tavily search query
  seoFocus:    string;     // primary keyword to optimise for
  variables?:  Record<string, string[]>; // values to rotate through
}

// ── Date helpers ──────────────────────────────────────────────────────────────
export function currentMonth(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
export function currentYear(): string {
  return String(new Date().getFullYear());
}
export function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Market News topics — daily, timely ───────────────────────────────────────
export const MARKET_NEWS_TOPICS: TopicSeed[] = [
  {
    category: 'market-news',
    tag: 'Mortgage Rates',
    titleTemplate: 'Mortgage Rates Today — {date}',
    searchQuery: 'mortgage rates today 30 year fixed site:mortgagenewsdaily.com OR site:bankrate.com OR site:freddiemac.com',
    seoFocus: 'mortgage rates today',
  },
  {
    category: 'market-news',
    tag: 'Fed Policy',
    titleTemplate: 'Fed Policy Update: What It Means for Mortgage Rates — {month}',
    searchQuery: 'Federal Reserve interest rate decision mortgage rates impact 2026',
    seoFocus: 'Fed mortgage rates 2026',
  },
  {
    category: 'market-news',
    tag: 'Housing Market',
    titleTemplate: 'Housing Inventory Report: {month} Update',
    searchQuery: 'housing inventory for sale months supply 2026 site:nar.realtor OR site:redfin.com OR site:zillow.com',
    seoFocus: 'housing inventory 2026',
  },
  {
    category: 'market-news',
    tag: 'Home Prices',
    titleTemplate: 'Home Prices {month}: Where Are Values Headed?',
    searchQuery: 'median home price appreciation decline 2026 housing market Case-Shiller',
    seoFocus: 'home prices 2026',
  },
  {
    category: 'market-news',
    tag: 'Refinance',
    titleTemplate: 'Refinance Activity Surge: Should You Lock In Before Rates Move?',
    searchQuery: 'refinance applications mortgage demand MBA weekly survey 2026',
    seoFocus: 'refinance rates 2026',
  },
  {
    category: 'market-news',
    tag: 'Economy',
    titleTemplate: 'Inflation Data and Mortgage Rates — {month} Analysis',
    searchQuery: 'CPI inflation report impact mortgage rates housing 2026',
    seoFocus: 'inflation mortgage rates 2026',
  },
  {
    category: 'market-news',
    tag: 'Mortgage Rates',
    titleTemplate: '30-Year vs 15-Year Fixed Rates: The {month} Spread Analysis',
    searchQuery: '30 year vs 15 year fixed mortgage rate spread comparison 2026',
    seoFocus: '15 year vs 30 year mortgage rate',
  },
  {
    category: 'market-news',
    tag: 'Home Prices',
    titleTemplate: 'Cities Where Home Values Are Rising Fastest — {month} Rankings',
    searchQuery: 'fastest appreciating home prices cities metros 2026 Zillow Redfin Realtors',
    seoFocus: 'fastest rising home values cities 2026',
  },
  {
    category: 'market-news',
    tag: 'Housing Market',
    titleTemplate: 'Buyer vs. Seller Market: Who Has the Upper Hand in {month}?',
    searchQuery: 'buyers sellers market conditions days on market offer competition 2026',
    seoFocus: 'buyer seller market 2026',
  },
  {
    category: 'market-news',
    tag: 'Economy',
    titleTemplate: 'Jobs Report and Mortgage Rates: How Employment Data Moves Housing',
    searchQuery: 'jobs report unemployment mortgage rates housing market impact 2026',
    seoFocus: 'jobs report mortgage rates',
  },
  {
    category: 'market-news',
    tag: 'Mortgage Rates',
    titleTemplate: 'Rate Lock Alert: Mortgage Rates {month} — Lock or Float?',
    searchQuery: 'mortgage rate lock strategy float 2026 rate direction outlook',
    seoFocus: 'mortgage rate lock or float 2026',
  },
  {
    category: 'market-news',
    tag: 'Housing Market',
    titleTemplate: 'New Construction vs Existing Homes: {month} Market Gap',
    searchQuery: 'new construction homes vs existing homes inventory price gap 2026',
    seoFocus: 'new construction homes 2026',
  },
];

// ── Knowledge Hub topics — evergreen SEO, rotated weekly ─────────────────────
export const KNOWLEDGE_HUB_TOPICS: TopicSeed[] = [
  // City / Metro guides
  {
    category: 'knowledge-hub',
    tag: 'City Guide',
    titleTemplate: 'How Much House Can You Afford in {city}, {state}? {year} Guide',
    searchQuery: 'median home price mortgage affordability income required {city} {state} 2026',
    seoFocus: 'how much house can you afford in {city}',
    variables: {
      city:  ['Los Angeles', 'San Diego', 'Phoenix', 'Austin', 'Dallas', 'Houston', 'Miami', 'Denver', 'Seattle', 'Atlanta', 'Nashville', 'Charlotte', 'Tampa', 'Las Vegas', 'Sacramento', 'Portland', 'San Jose', 'Riverside', 'San Francisco', 'Chicago'],
      state: ['CA',          'CA',        'AZ',      'TX',     'TX',     'TX',      'FL',   'CO',     'WA',     'GA',      'TN',        'NC',        'FL',   'NV',        'CA',         'OR',       'CA',        'CA',        'CA',            'IL'],
    },
  },
  {
    category: 'knowledge-hub',
    tag: 'State Guide',
    titleTemplate: 'Best States to Buy a Home in {year}: Affordability, Appreciation & Taxes',
    searchQuery: 'best states buy home affordability property tax appreciation 2026 ranking',
    seoFocus: 'best states to buy a home 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'State Guide',
    titleTemplate: 'Buying a Home in {state}: {year} Guide to Mortgage Rates, Limits & Costs',
    searchQuery: 'buying home {state} mortgage rates loan limits closing costs 2026',
    seoFocus: 'buying a home in {state} 2026',
    variables: {
      state: ['California', 'Texas', 'Florida', 'New York', 'Arizona', 'Colorado', 'Washington', 'Georgia', 'North Carolina', 'Nevada', 'Tennessee', 'Oregon', 'Virginia', 'Maryland'],
    },
  },
  // Loan strategy
  {
    category: 'knowledge-hub',
    tag: 'Loan Strategy',
    titleTemplate: 'Conventional Loan vs FHA in {year}: Which Is Right for You?',
    searchQuery: 'conventional loan vs FHA comparison down payment PMI MIP 2026',
    seoFocus: 'conventional vs FHA loan 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'Loan Strategy',
    titleTemplate: '5/1 ARM vs 30-Year Fixed in {year}: When Does Adjustable Rate Win?',
    searchQuery: 'ARM adjustable rate mortgage vs fixed 30 year comparison breakeven 2026',
    seoFocus: 'ARM vs fixed rate mortgage 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'Jumbo Loans',
    titleTemplate: 'Jumbo Loan Guide {year}: Rates, Limits & Qualification Requirements',
    searchQuery: 'jumbo loan rates requirements credit score down payment 2026 California',
    seoFocus: 'jumbo loan rates 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'First-Time Buyers',
    titleTemplate: 'First-Time Homebuyer Guide {year}: Down Payment, DTI & Pre-Approval',
    searchQuery: 'first time homebuyer guide down payment assistance pre-approval 2026',
    seoFocus: 'first time homebuyer guide 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'Refinance',
    titleTemplate: 'When Does Refinancing Make Sense in {year}? Breakeven Calculator Guide',
    searchQuery: 'when to refinance mortgage breakeven point closing costs 2026',
    seoFocus: 'when to refinance mortgage 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'Home Equity',
    titleTemplate: 'Cash-Out Refinance vs HELOC: Which Wins in {year}?',
    searchQuery: 'cash out refinance vs HELOC home equity line comparison 2026',
    seoFocus: 'cash out refinance vs HELOC 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'Market Timing',
    titleTemplate: 'Is It a Good Time to Buy a Home in {year}? The Data-Driven Answer',
    searchQuery: 'is it good time to buy house 2026 affordability rates market conditions',
    seoFocus: 'good time to buy a home 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'City Guide',
    titleTemplate: 'Fastest Appreciating Cities: Where Home Values Grew Most in {year}',
    searchQuery: 'fastest appreciating home values cities US markets 2026 Zillow Redfin',
    seoFocus: 'fastest appreciating home values 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'Affordability',
    titleTemplate: 'What Salary Do You Need to Buy a Median Home in {year}?',
    searchQuery: 'income required median home price mortgage qualification 2026 DTI',
    seoFocus: 'salary needed to buy a home 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'DSCR Loans',
    titleTemplate: 'DSCR Loans {year}: The Investor's Guide to No-Income Mortgages',
    searchQuery: 'DSCR loan investment property no income verification requirements 2026',
    seoFocus: 'DSCR loan guide 2026',
  },
  {
    category: 'knowledge-hub',
    tag: 'Down Payment',
    titleTemplate: '3% Down vs 20% Down: The Real Cost Difference Over 30 Years',
    searchQuery: '3 percent down payment vs 20 percent comparison PMI total cost mortgage',
    seoFocus: '3% down payment vs 20% mortgage cost',
  },
  {
    category: 'knowledge-hub',
    tag: 'Loan Strategy',
    titleTemplate: 'How to Lower Your Mortgage Rate Without Refinancing — {year} Strategies',
    searchQuery: 'lower mortgage rate without refinancing recast extra payments strategies 2026',
    seoFocus: 'lower mortgage rate without refinancing',
  },
];

// ── Topic picker — deterministic rotation based on day of year ───────────────
export function pickTopicsForToday(count: { news: number; hub: number }): TopicSeed[] {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
  const picked: TopicSeed[] = [];

  for (let i = 0; i < count.news; i++) {
    const idx = (dayOfYear * count.news + i) % MARKET_NEWS_TOPICS.length;
    picked.push(MARKET_NEWS_TOPICS[idx]);
  }

  for (let i = 0; i < count.hub; i++) {
    const idx = (dayOfYear * count.hub + i) % KNOWLEDGE_HUB_TOPICS.length;
    picked.push(KNOWLEDGE_HUB_TOPICS[idx]);
  }

  return picked;
}

// ── Variable resolver — picks rotating city/state for variable topics ─────────
export function resolveTopicVariables(seed: TopicSeed, dayOffset = 0): { title: string; query: string; seoFocus: string } {
  const day = Math.floor(Date.now() / 86_400_000) + dayOffset;
  let title    = seed.titleTemplate;
  let query    = seed.searchQuery;
  let seoFocus = seed.seoFocus;

  if (seed.variables) {
    const keys = Object.keys(seed.variables);
    for (const key of keys) {
      const vals = seed.variables[key];
      const val  = vals[day % vals.length];
      title    = title.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
      query    = query.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
      seoFocus = seoFocus.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
    }
  }

  title    = title.replace('{date',  todayLabel()).replace('{date}', todayLabel());
  title    = title.replace('{month}', currentMonth());
  title    = title.replace('{year}',  currentYear());
  query    = query.replace('{year}',  currentYear());
  seoFocus = seoFocus.replace('{year}', currentYear());

  return { title, query, seoFocus };
}

// ── Slug generator ────────────────────────────────────────────────────────────
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}
