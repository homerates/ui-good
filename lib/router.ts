export type Route =
  | "market"
  | "concept"
  | "mythfact"
  | "action.search_listings"
  | "action.calc_payment"
  | "action.program_lookup";

export function preclassify(q: string): Route | null {
  const s = (q || "").toLowerCase().trim();
  if (!s) return null;
  if (/listings?|mls|zillow|redfin|homes?\s+near|in\s+\d{5}/.test(s)) return "action.search_listings";
  if (/(payment|piti|monthly|how much per month)/.test(s)) return "action.calc_payment";
  if (/(fha|conventional|jumbo|dscr|access zero|program|guideline).*(what|which|qualif)/.test(s)) return "action.program_lookup";
  if (/^(myth|is it true that|people say)/.test(s)) return "mythfact";
  if (/(why|because).*rates|fed|treasury|spread|inflation|cpi|jobs|yield/.test(s)) return "market";
  if (/what is|define|difference between|how does .* work/.test(s)) return "concept";
  return null;
}
