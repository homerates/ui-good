export type LoanLimitRow = {
  county: string;
  oneUnit: number;
  twoUnit?: number;
  threeUnit?: number;
  fourUnit?: number;
  highCost?: boolean;
};

export const countyLoanLimitsCA: LoanLimitRow[] = [
  { county: "Los Angeles", oneUnit: 1150000, highCost: true },
  { county: "Orange",      oneUnit: 1150000, highCost: true },
  { county: "Ventura",     oneUnit: 1150000, highCost: true },
  { county: "San Diego",   oneUnit: 1150000, highCost: true },
];
