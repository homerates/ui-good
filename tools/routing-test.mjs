/**
 * Routing accuracy test — chip seeds + free-text follow-ups
 * Run: node tools/routing-test.mjs
 *
 * Tests every chip seed from cardBuilders.ts against the routing logic
 * in chat/page.tsx. Goal: 100% of chips route to 'answers'.
 * Scenario route is only for open-ended investment analysis from scratch.
 */

// ─── Mirror of chat/page.tsx routing logic ─────────────────────────────────

function simulate(q, lastRoute = 'answers') {
    const t = q.toLowerCase();

    const isDeepAnalysisSeed = /^\[deep-analysis\]/i.test(q);

    const isComparisonQuestion = !isDeepAnalysisSeed && (
        /(?:5\s*%|five\s*percent)\s*(?:vs|versus|or|compared\s*to)\s*(?:20\s*%|twenty\s*percent)/i.test(q) ||
        /(?:20\s*%|twenty\s*percent)\s*(?:vs|versus|or|compared\s*to)\s*(?:5\s*%|five\s*percent)/i.test(q) ||
        /compare\s+5\s*%?\s*(?:vs?|versus|or)\s*20\s*%/i.test(q) ||
        /\bdown\s*payment\s*(comparison|vs|versus)\b/i.test(q) ||
        /\brate\s*buydown\b.{0,30}\b(vs|versus|price\s*reduction)\b/i.test(q) ||
        /\bseller\s*credit\b.{0,30}\b(rate|buydown|reduction)\b/i.test(q) ||
        /\b15\s*(yr|year).{0,20}(vs|versus).{0,20}30\s*(yr|year)\b/i.test(q) ||
        /\b30\s*(yr|year).{0,20}(vs|versus).{0,20}15\s*(yr|year)\b/i.test(q) ||
        /\brent\s*(vs|versus)\s*buy\b/i.test(q) ||
        /\bshould\s*i\s*(rent|buy)\b/i.test(q)
    );

    const isFHAQuestion =
        /\bfha\b/i.test(q) || /\bmip\b|\bufmip\b/i.test(q) || /3\.5\s*%\s*down/i.test(q);

    const isDownPaymentFollowUp =
        !isDeepAnalysisSeed && !isComparisonQuestion &&
        lastRoute === 'answers' &&
        /\b(\d+)\s*%\s*down\b/i.test(q);

    const isRefiFollowUp =
        /rates?\s+(?:go|drop|fall|hit|come\s*down)|drop\s+to|down\s+to|what\s+if.*(?:rate|rates?|mortgage).*%|what\s+if.*%.*(?:rate|rates?|drop|fall|go|hit)|refi|refinanc|cash.?out/i.test(q);

    const isAnswersRouteFollowUp =
        !isDeepAnalysisSeed && !isComparisonQuestion &&
        lastRoute === 'answers' &&
        !/\b(dscr|cap\s*rate|vacancy|noi|gross\s*rent|net\s*operating|investment\s*property|rental\s*income|cash\s*flow|debt\s*service)\b/i.test(q);

    const isFollowUp =
        t.includes('what if') || t.includes('what about') || t.includes('instead') ||
        t.includes('same property') || t.includes('same home') ||
        t.includes('that property') || t.includes('that home') || t.includes('previous') ||
        t.includes('show me') || t.includes('run that') || t.includes('run it') ||
        t.includes('break even') || t.includes('breakeven') || t.includes('break-even') ||
        t.includes('closing cost') || t.includes('lender credit') ||
        t.includes('no cost') || t.includes('no-cost') || t.includes('trigger rate') ||
        t.includes('shorten') || t.includes('15 year') || t.includes('15-year') ||
        t.includes('20 year') || t.includes('20-year') || t.includes('extra pay') ||
        t.includes('principal pay') || t.includes('sell in') ||
        t.includes('if i sell') || t.includes('if we sell') || t.includes('plan to sell') ||
        /^\s*(?:yes|yeah|yep|ok|okay|sure|do it|go ahead)\s*$/i.test(q);

    const isRateMarketQuestion =
        /\b(30|15|20)\s*[- ]?year\s*(fixed|mortgage|rate|loan)?/i.test(q) ||
        /\b10\s*[- ]?year\s*(note|treasury|yield|bond|t-?note)/i.test(q) ||
        /\b(current|today.?s?|what.?s?|where.?s?)\s+(mortgage\s+)?rate/i.test(q) ||
        /\bfed\s+(rate|fund|funds)/i.test(q) || /\b(rate|rates)\s+(right now|today|currently)/i.test(q) ||
        /what.{0,20}(10|ten).{0,20}(note|treasury|yield)/i.test(q);

    const looksLikeScenario =
        t.includes('compare') || t.includes(' vs ') ||
        t.includes('cash out') || t.includes('cash-out') ||
        t.includes('projection') || t.includes('stress test');

    const hasNumbersContext = /\$\s?\d+|\d+%|\b\d+\s*(yr|yrs|year|years)\b/.test(t);

    // Cascade (mirrors chat/page.tsx exactly)
    let useScenario = false;
    let guard = '';

    if (isDeepAnalysisSeed) {
        useScenario = false; guard = 'isDeepAnalysisSeed';
    } else if (isComparisonQuestion) {
        useScenario = false; guard = 'isComparisonQuestion';
    } else if (isFHAQuestion || isDownPaymentFollowUp || isRefiFollowUp || isAnswersRouteFollowUp) {
        useScenario = false;
        guard = [isFHAQuestion && 'FHA', isDownPaymentFollowUp && 'downPmt', isRefiFollowUp && 'refi', isAnswersRouteFollowUp && 'answersNet'].filter(Boolean).join('+');
    } else if (isFollowUp && lastRoute) {
        useScenario = lastRoute === 'scenario'; guard = `followUp(${lastRoute})`;
    } else if (!isRateMarketQuestion && looksLikeScenario && hasNumbersContext) {
        useScenario = true; guard = `looksLikeScenario+numbers`;
    } else {
        useScenario = false; guard = 'default';
    }

    return { route: useScenario ? 'scenario' : 'answers', guard };
}

// ─── Test cases ─────────────────────────────────────────────────────────────
// Format: [label, seed, lastRoute, expectedRoute]

const tests = [
    // ── Conventional card chips (lastRoute=answers) ──────────────────────────
    ['CONV: rate drop',       'Same home, rate drops to 6.46%',                         'answers', 'answers'],
    ['CONV: down pct change', 'Same home with 20% down',                                'answers', 'answers'],
    ['CONV: price up',        'Conventional loan on a $700k home with 20% down at 7%', 'answers', 'answers'],
    ['CONV: extra payment',   'If I make 1 extra payment per year on a $500k loan at 7%, when do I pay it off?', 'answers', 'answers'],

    // ── FHA card chips ───────────────────────────────────────────────────────
    ['FHA: 10% down',         'FHA loan on $500k home with 10% down at 7%',                          'answers', 'answers'],
    ['FHA: conv 20% down',    'Conventional loan on $500k home with 20% down at 7%',                 'answers', 'answers'],
    ['FHA: compare vs conv',  'Compare FHA 3.5% down vs conventional 5% down on $500k at 7%',        'answers', 'answers'],
    ['FHA: equity 80% LTV',   'FHA equity milestone on $500k home — when does my loan hit 80% LTV?', 'answers', 'answers'],
    ['FHA: rate drop',        'FHA loan on $500k home with 3.5% down at 6.5%',                       'answers', 'answers'],

    // ── Refi card chips ──────────────────────────────────────────────────────
    ['REFI: strike rate',     'Refi from 7% to 6.5% on $500k — full cost and breakeven',            'answers', 'answers'],
    ['REFI: deeper rate',     'Refi from 7% to 6.0% on $500k',                                      'answers', 'answers'],
    ['REFI: trigger rate',    'Refi $500k at 7% to 6.25% — full breakeven analysis',                'answers', 'answers'],
    ['REFI: sell in 3yr',     'If I refi $500k from 7% to 6.5% and sell in 3 years, am I ahead?',  'answers', 'answers'],
    ['REFI: no-cost refi',    'No-cost refi on $500k from 7% to 6.25% — lender covers closing costs', 'answers', 'answers'],
    ['REFI: 20yr vs 30yr',    'Compare 20-year refi at 6.25% vs 30-year refi at 6.5% on $500k',    'answers', 'answers'],
    ['REFI: to 30yr',         'Refi $500k to 30-year at 6.5% — breakeven and net savings',          'answers', 'answers'],
    ['REFI: extra 1/yr',      'If I make 1 extra payment per year on $500k at 6.5%, payoff date?', 'answers', 'answers'],
    ['REFI: extra to 20yr',   'If I take 30yr refi at 6.5% on $500k and want to pay off in 20 years, how much extra/mo?', 'answers', 'answers'],
    ['REFI: no-cost rate',    "What's the no-cost refi rate on $500k if the 30yr is 6.5%?",         'answers', 'answers'],
    ['REFI: 20yr vs 30yr b',  'Compare 20yr vs 30yr refi on $500k at 6.5%',                         'answers', 'answers'],
    ['REFI: extra payments',  'Compare making $500/mo extra payments vs refinancing my $500k mortgage from 6.5% to 5.99%', 'answers', 'answers'],

    // ── Previously drifting chip (FIXED) ────────────────────────────────────
    ['REFI: cash-out OLD',    'How much equity can I cash out on a $500k mortgage at 6.5%?',         'answers', 'answers'],
    ['REFI: cash-out NEW',    'How much equity can I pull out via refi on a $500k mortgage at 6.5%?','answers', 'answers'],

    // ── DSCR card chips ──────────────────────────────────────────────────────
    ['DSCR: rent drops',      'DSCR on $500k investment property, rent drops to $2,700/mo, 25% down, 7%',      'answers', 'answers'],
    ['DSCR: rate up',         'DSCR investment property $500k, 25% down, $3,000 rent, rate goes to 7.5%',      'answers', 'answers'],
    ['DSCR: 30% down',        'DSCR on $500k investment property, 30% down, $3,000 rent, 7% — cash flow?',    'answers', 'answers'],
    ['DSCR: min rent 1.25x',  'What monthly rent do I need for 1.25x DSCR on $500k at 7% with 25% down?',     'answers', 'answers'],
    ['DSCR: lenders <1.0x',   'Which DSCR lenders approve below 1.0x DSCR?',                                   'answers', 'answers'],
    ['DSCR: $450k example',   '$450k investment property, $3,200/mo rent, 25% down at 7%',                     'answers', 'answers'],
    ['DSCR: compare leverage','DSCR on $500k investment property, 25% down, $3,000 rent, 7% — compare leverage vs cash flow', 'answers', 'answers'],
    ['DSCR: rate drop',       'Same rental property, rate drops to 6.5%',                                      'answers', 'answers'],
    ['DSCR: rent up chip',    'Same property, rent increases to $3,500/month',                                  'answers', 'answers'],
    ['DSCR: UW guidelines',   'Ask Underwriting: what minimum DSCR ratio do lenders require for investment property loans?', 'answers', 'answers'],

    // ── Affordability card chips ─────────────────────────────────────────────
    ['AFF: price+salary',     'can i afford $650k on $120k salary',                                           'answers', 'answers'],
    ['AFF: price+salary2',    'can I afford a $500k home on $95k salary',                                     'answers', 'answers'],
    ['AFF: price no home',    'can i afford $800k on $150k a year',                                           'answers', 'answers'],
    ['AFF: $500 debts',       'Same affordability scenario with $500/month in other debts',                    'answers', 'answers'],
    ['AFF: 20% down',         'Same scenario with 20% down payment',                                           'answers', 'answers'],
    ['AFF: FHA option',       "What's the FHA loan option on my maximum affordable home price?",               'answers', 'answers'],
    ['AFF: income qualify',   'How much income do I need to qualify for this home?',                           'answers', 'answers'],
    ['AFF: save for 20% down','How long will it take me to save for 20% down on a $500k home? I make $120k',  'answers', 'answers'],
    ['AFF: conv vs FHA',      'Compare total cost of FHA vs conventional on a $500k home at 7% — I make $120k', 'answers', 'answers'],

    // ── Comparison card chips ────────────────────────────────────────────────
    ['COMP: deep analysis DP','[deep-analysis] Walk me through 5% vs 20% down on a $600k home at 6.75%',      'answers', 'answers'],
    ['COMP: deep analysis TR','[deep-analysis] Walk me through 15-year vs 30-year on a $600k home at 6.75%',  'answers', 'answers'],
    ['COMP: deep analysis RB','[deep-analysis] Walk me through rent vs buy on a $550k home at 6.75%',         'answers', 'answers'],

    // ── Slider context chips (getContextChips) ───────────────────────────────
    ['CTX: refi rate drop',   'Same refi, rate drops to 6.0%',                                                'answers', 'answers'],
    ['CTX: refi breakeven',   'How long to break even on refi closing costs for a $500k loan from 6.5% to 5.99%?', 'answers', 'answers'],
    ['CTX: loan limits FHA',  'Compare FHA 3.5% down vs conventional 20% down on a $700k home at 7%',        'answers', 'answers'],

    // ── Refi needs-input chips ───────────────────────────────────────────────
    ['REFI-NI: trigger rate', "What rate would I need to refi my $650k mortgage at 6.5%?",                    'answers', 'answers'],
    ['REFI-NI: now vs wait',  'Compare refinancing my $650k balance to 5.99% now vs waiting for a lower rate','answers', 'answers'],
    ['REFI-NI: extra vs refi','Compare making $500/mo extra payments vs refinancing my $650k mortgage',       'answers', 'answers'],

    // ── High-risk free-text follow-ups users might type ──────────────────────
    ['FREE: cash-out typed',  'What would a cash-out refi look like on my home?',                             'answers', 'answers'],
    ['FREE: projection',      'Show me a projection of my equity over 10 years',                              'answers', 'answers'],
    ['FREE: stress test',     'Can you stress test what happens if rates hit 8%?',                            'answers', 'answers'],
    ['FREE: compare rates',   'Compare the 6% vs 7% scenarios on my home',                                   'answers', 'answers'],
    ['FREE: DSCR after conv', 'What would the DSCR be if I rented this out?',                                 'answers', 'answers'], // DSCR calc is in answers route ✓
    ['FREE: investment prop', 'Run the numbers as an investment property at $3,500 rent',                     'answers', 'answers'], // DSCR calc is in answers route ✓
    ['FREE: after scenario',  'What if I put 30% down instead?',                                              'scenario','scenario'], // isFollowUp(what if) → sticks with scenario
    ['FREE: after scenario 2','Compare this with buying in cash',                                             'scenario','answers'], // no numbers → defaults to answers (acceptable)
];

// ─── Runner ──────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
const failures = [];

for (const [label, seed, lastRoute, expected] of tests) {
    const { route, guard } = simulate(seed, lastRoute);
    const ok = route === expected;
    if (ok) { pass++; }
    else {
        fail++;
        failures.push({ label, seed, lastRoute, expected, actual: route, guard });
    }
}

const total = pass + fail;
const pct = ((pass / total) * 100).toFixed(1);

console.log(`\n📊 Routing accuracy: ${pass}/${total} (${pct}%)\n`);

if (failures.length) {
    console.log('❌ FAILURES:\n');
    for (const f of failures) {
        console.log(`  [${f.label}]`);
        console.log(`    Seed:     "${f.seed.slice(0, 80)}"`);
        console.log(`    Context:  lastRoute=${f.lastRoute}`);
        console.log(`    Expected: ${f.expected}  →  Got: ${f.actual}  (guard: ${f.guard})\n`);
    }
} else {
    console.log('✅ All tests passed.');
}
