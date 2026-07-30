// Shared "is this a plausible real-estate sale year" bound.
//
// Previously duplicated (and independently drifted) across three files:
// app/api/homeowner/analysis/route.ts (parseFlexDate), app/(consumer)/my-home/page.tsx
// (parseFlexDateClient), and app/api/property/lookup/route.ts (parseMonthYear). Each had its
// own inline year check; one of the three had no upper bound at all. That gap let a real
// month name immediately followed by an unrelated 4-digit number in source text — a
// property's own house number, e.g. "January 2420" from "2420 County Down Dr" — parse as a
// valid Date centuries in the future. A future sale date then makes downstream
// years-since-purchase math clamp to 0, silently reporting the raw historical sale price as
// today's value.
//
// A sale can never be in the future, so the upper bound is always "this year" — no reason
// for it to ever differ between call sites. Import this instead of re-deriving the check.
export function isPlausibleSaleYear(year: number): boolean {
  return year >= 1900 && year <= new Date().getFullYear();
}
