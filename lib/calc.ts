export function estimatePITI(
  loanAmount:number,
  rateAnnualPct:number,
  opts?: { taxRateGuess?:number; insGuess?:number }
) {
  const r = rateAnnualPct / 100 / 12;
  const n = 360;
  const pAndI = r === 0 ? loanAmount / n : (loanAmount * r) / (1 - Math.pow(1 + r, -n));
  const tax = (opts?.taxRateGuess ?? 0.0125) * (loanAmount / 0.8) / 12;
  const ins = (opts?.insGuess ?? 900) / 12;
  return Math.round(pAndI + tax + ins);
}
