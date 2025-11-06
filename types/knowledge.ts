export type CountyTaxRate = { county: string; rate: number }; // e.g., 0.012 = 1.2%
export type ZipCountyMap = Record<string, string>;             // "90011" -> "Los Angeles"
export type LoanLimitRow = { county: string; oneUnit: number; twoUnit: number; threeUnit: number; fourUnit: number };
export type ProductId = "DSCR" | "ACCESS_ZERO" | "JUMBO_ADV" | "FHA" | "VA" | "FNMA" | "FHLMC";

export type ProductGuide = {
  id: ProductId;
  label: string;
  summary: string;
  notes?: string[];
  links?: { label: string; url: string }[];
  eligibilityKeys?: string[]; // keywords to match UI prompts
};

export type Acronym = { key: string; meaning: string; context?: string };
