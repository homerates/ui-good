import { estimatePITI } from "./calc";

export function composeMarket(args: { fred:any; news:any[]; q:string; loanAmount?:number }) {
  const { fred, news, q, loanAmount = 500000 } = args;
  const rate = fred?.mortgage30 ?? 6.75;
  const delta = Math.round(estimatePITI(100000, rate) - estimatePITI(100000, rate - 0.5));
  return {
    markdown:
**Data now**
 10-yr: \% • 30-yr avg: \% • Spread: \%

**What that means**
Payment change per \ about \$\ for a 0.5% rate move.

**Next**
Watch CPI/Fed guidance and 10-yr trend.,
    news: news?.slice(0,3) ?? []
  };
}

export function composeConcept(q:string) {
  return { markdown: Short, plain-English definition for: **\** };
}

export function composeMythFact(q:string, fred:any, news:any[]) {
  return {
    label: "Partly true",
    markdown:
**Verdict:** Partly true. The Fed influences, but does not set, 30-yr mortgage rates.

**What’s driving it**
- 10-yr Treasury trend
- Inflation/CPI
- Risk premiums in MBS

**Borrower takeaway:** Focus on payment options (credits/buydowns) over headlines.,
    sources: news?.slice(0,3) ?? []
  };
}

export function composeInsightCard(args: { fred:any; loanAmount?:number }) {
  const rate = args.fred?.mortgage30 ?? 6.75;
  const L = args.loanAmount ?? 500000;
  return {
    paymentNow: estimatePITI(L, rate),
    paymentPlus25bps: estimatePITI(L, rate + 0.25),
    paymentMinus25bps: estimatePITI(L, rate - 0.25),
    drivers: ["10-yr yield", "CPI print", "Fed comms"],
    tip: "Compare a 1-0 buydown vs price cut when sellers offer credits."
  };
}
