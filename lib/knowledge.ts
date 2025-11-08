// lib/knowledge.ts
import countyData from "../data/knowledge/taxes/countyTaxCA.json";
import limitsData from "../data/knowledge/limits/loanLimitsCA.json";
import productData from "../data/knowledge/products/registry.json";
import acronymsData from "../data/knowledge/acronyms.json";

export function countyFromZip(zip: string): string | undefined {
  const z = (zip || "").trim();
  return (countyData.zipToCounty as Record<string, string>)[z];
}

export function taxRateForZip(zip: string): number | undefined {
  const county = countyFromZip(zip);
  if (!county) return undefined;
  return (countyData.countyTaxRates as { county: string; rate: number }[])
    .find(r => r.county === county)?.rate;
}

export function loanLimitsForZip(zip: string) {
  const county = countyFromZip(zip);
  if (!county) return undefined;
  return (limitsData.conformingLoanLimits as any[])
    .find(r => r.county.toLowerCase() === county.toLowerCase());
}

export function productById(id: string) {
  return (productData.registry as any[]).find(p => p.id === id);
}

export function listProducts() {
  return productData.registry as any[];
}

export function listAcronyms() {
  return acronymsData.acronyms as any[];
}
