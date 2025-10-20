import { preclassify, Route } from "./router";
import { composeMarket, composeConcept, composeMythFact, composeInsightCard } from "./composers";
import { getFredSnapshot } from "./fred";
import { tavilyNews } from "./tavily";
import { chat } from "./llm"; // your existing OpenAI wrapper

export async function orchestrate(route: Route, q: string, opts: { zip?: string; loanAmount?: number } = {}) {
  switch (route) {
    case "market": {
      const fred = await getFredSnapshot();
      const news = await tavilyNews(q, { days: 7, limit: 5 } as any).catch(() => []);
      const composed = composeMarket({ fred, news, q, loanAmount: opts.loanAmount });
      const borrower = composeInsightCard({ fred, loanAmount: opts.loanAmount });
      const reasoning = await chat([
        { role: "system", content: "You are a concise CA mortgage explainer. Use data first, then borrower impact. End with 'Next:' one line." },
        { role: "user", content: q }
      ], { model: "gpt-4o-mini", temperature: 0.2 } as any).catch(() => "");
      return { type:"market", fred, news: composed.news, borrower, answer: composed.markdown + "\n\n" + reasoning };
    }
    case "concept": {
      const concept = composeConcept(q);
      const reasoning = await chat([
        { role: "system", content: "Explain clearly in 3-5 bullets. Include 1 'Watch out' nuance. No rates unless asked." },
        { role: "user", content: q }
      ], { model: "gpt-4o-mini", temperature: 0.2 } as any).catch(() => concept.markdown);
      return { type:"concept", answer: reasoning };
    }
    case "mythfact": {
      const fred = await getFredSnapshot();
      const news = await tavilyNews(q, { days: 30, limit: 5 } as any).catch(() => []);
      const mf = composeMythFact(q, fred, news);
      return { type:"mythfact", ...mf };
    }
    case "action.search_listings":
      return { type:"action.search_listings", status:"not_configured" };
    case "action.calc_payment":
      return { type:"action.calc_payment", status:"todo" };
    case "action.program_lookup":
      return { type:"action.program_lookup", status:"todo" };
    default:
      return { type:"concept", answer:"" };
  }
}
