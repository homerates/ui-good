// lib/pdf/ScenarioPdf.tsx
// React-PDF document for all scenario types.
// Used by /api/pdf route — server-side only (Node.js runtime).

import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { calcPI, calcTotalInterest, calcRefiBreakEven } from '../math';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number, decimals = 0) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n: number, d = 2) {
    return n.toFixed(d) + '%';
}
function today() {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
    page:       { padding: '40 48', fontFamily: 'Helvetica', backgroundColor: '#ffffff', color: '#0f172a' },
    badge:      { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    badgeDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00c96b', marginRight: 6 },
    badgeText:  { fontSize: 8, fontWeight: 'bold', color: '#00c96b', letterSpacing: 1.2, textTransform: 'uppercase' },
    title:      { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 4 },
    subtitle:   { fontSize: 10, color: '#64748b', marginBottom: 28 },
    divider:    { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 18 },
    sectionHdr: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#00c96b', letterSpacing: 1.2,
                  textTransform: 'uppercase', marginBottom: 8 },
    grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
    cell:       { width: '33%', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1,
                  borderBottomColor: '#f1f5f9', borderRightWidth: 1, borderRightColor: '#f1f5f9' },
    cellLabel:  { fontSize: 8, color: '#94a3b8', marginBottom: 3 },
    cellValue:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
    cellNote:   { fontSize: 7.5, color: '#94a3b8', marginTop: 1 },
    highlight:  { backgroundColor: '#f0fdf4', borderRadius: 4, padding: '10 12', marginTop: 16, marginBottom: 16,
                  flexDirection: 'row', alignItems: 'center' },
    hlLabel:    { fontSize: 8.5, color: '#15803d', flex: 1 },
    hlValue:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#15803d' },
    disc:       { marginTop: 'auto', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    discText:   { fontSize: 7, color: '#94a3b8', lineHeight: 1.5 },
    footer:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    footerL:    { fontSize: 7, color: '#cbd5e1' },
    footerR:    { fontSize: 7, color: '#cbd5e1' },
});

// ── Cell component ────────────────────────────────────────────────────────────

function Cell({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <View style={S.cell}>
            <Text style={S.cellLabel}>{label}</Text>
            <Text style={S.cellValue}>{value}</Text>
            {note ? <Text style={S.cellNote}>{note}</Text> : null}
        </View>
    );
}

// ── Document builders per type ─────────────────────────────────────────────────

function ConventionalDoc({ params }: { params: any }) {
    const { price = 700000, downPct = 20, rate = 7, term = 30, taxRate = 0.011, insRate = 0.004, loanType = 'conventional' } = params;
    const downAmt  = price * (downPct / 100);
    const loanAmt  = price - downAmt;
    const ltv      = loanAmt / price * 100;
    const pi       = calcPI(loanAmt, rate, term);
    const taxMo    = price * taxRate / 12;
    const insMo    = price * insRate / 12;
    const pmiMo    = ltv > 80 ? loanAmt * 0.006 / 12 : 0;
    const total    = pi + taxMo + insMo + pmiMo;
    const totalInt = calcTotalInterest(loanAmt, rate, term);
    const isHB     = loanType === 'highbal';

    return (
        <Document>
            <Page size="LETTER" style={S.page}>
                <View style={S.badge}>
                    <View style={S.badgeDot} />
                    <Text style={S.badgeText}>HomeRates.ai — Mortgage Intelligence</Text>
                </View>
                <Text style={S.title}>{isHB ? 'High Balance' : 'Conventional'} Loan Analysis</Text>
                <Text style={S.subtitle}>Generated {today()} · Estimates only — not a commitment to lend</Text>
                <View style={S.divider} />
                <View style={S.highlight}>
                    <Text style={S.hlLabel}>Total Monthly Payment (PITI{pmiMo > 0 ? '+PMI' : ''})</Text>
                    <Text style={S.hlValue}>{fmt$(total)}/mo</Text>
                </View>
                <Text style={S.sectionHdr}>Loan Details</Text>
                <View style={S.grid}>
                    <Cell label="Purchase Price"    value={fmt$(price)} />
                    <Cell label="Down Payment"      value={fmt$(downAmt)} note={`${downPct}% down`} />
                    <Cell label="Loan Amount"       value={fmt$(loanAmt)} />
                    <Cell label="Interest Rate"     value={fmtPct(rate)} note={`${term}-yr fixed`} />
                    <Cell label="LTV"               value={fmtPct(ltv)} />
                    <Cell label="PMI"               value={ltv > 80 ? fmt$(pmiMo) + '/mo' : 'None (LTV ≤ 80%)'} />
                </View>
                <Text style={[S.sectionHdr, { marginTop: 16 }]}>Monthly Breakdown</Text>
                <View style={S.grid}>
                    <Cell label="Principal & Interest" value={fmt$(pi) + '/mo'} />
                    <Cell label="Property Tax"         value={fmt$(taxMo) + '/mo'} note={fmtPct(taxRate * 100) + ' annual'} />
                    <Cell label="Homeowner's Insurance" value={fmt$(insMo) + '/mo'} note={fmtPct(insRate * 100) + ' annual'} />
                </View>
                <Text style={[S.sectionHdr, { marginTop: 16 }]}>Lifetime Cost</Text>
                <View style={S.grid}>
                    <Cell label="Total Interest Paid"  value={fmt$(totalInt)} note={`Over ${term} years`} />
                    <Cell label="Total of Payments"    value={fmt$(pi * term * 12)} />
                    <Cell label="Cash at Close (est.)" value={fmt$(downAmt + price * 0.025)} note="Down + ~2.5% closing costs" />
                </View>
                <View style={S.disc}>
                    <Text style={S.discText}>
                        Educational estimates only. Monthly payment includes principal & interest, property tax at {fmtPct(taxRate * 100, 1)} annually,
                        homeowner's insurance at {fmtPct(insRate * 100, 1)} annually{pmiMo > 0 ? ', and PMI until LTV reaches 80%' : ''}.
                        Actual rate depends on credit score, lender, and lock timing. Not a Loan Estimate or pre-approval under RESPA/TRID.
                        Conforming loan limits per FHFA 2026 guidelines.
                    </Text>
                    <View style={S.footer}>
                        <Text style={S.footerL}>chat.homerates.ai</Text>
                        <Text style={S.footerR}>© {new Date().getFullYear()} HomeRates.ai · For educational use only</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}

function FhaDoc({ params }: { params: any }) {
    const { price = 500000, downPct = 3.5, rate = 7, term = 30, taxRate = 0.011, insRate = 0.004 } = params;
    const downAmt   = price * (downPct / 100);
    const baseLoan  = price - downAmt;
    const ltv       = baseLoan / price * 100;
    const ufmipRate = 0.0175;
    const ufmip     = baseLoan * ufmipRate;
    const loanAmt   = baseLoan + ufmip;
    const mipRate   = ltv > 90 ? 0.0055 : 0.005;
    const mipMo     = baseLoan * mipRate / 12;
    const pi        = calcPI(loanAmt, rate, term);
    const taxMo     = price * taxRate / 12;
    const insMo     = price * insRate / 12;
    const total     = pi + taxMo + insMo + mipMo;
    const totalInt  = calcTotalInterest(loanAmt, rate, term);

    return (
        <Document>
            <Page size="LETTER" style={S.page}>
                <View style={S.badge}><View style={S.badgeDot} /><Text style={S.badgeText}>HomeRates.ai — Mortgage Intelligence</Text></View>
                <Text style={S.title}>FHA Loan Analysis</Text>
                <Text style={S.subtitle}>Generated {today()} · Estimates only — not a commitment to lend</Text>
                <View style={S.divider} />
                <View style={S.highlight}>
                    <Text style={S.hlLabel}>Total Monthly Payment (PITI + MIP)</Text>
                    <Text style={S.hlValue}>{fmt$(total)}/mo</Text>
                </View>
                <Text style={S.sectionHdr}>Loan Details</Text>
                <View style={S.grid}>
                    <Cell label="Purchase Price"   value={fmt$(price)} />
                    <Cell label="Down Payment"     value={fmt$(downAmt)} note={`${downPct}% down (min 3.5%)`} />
                    <Cell label="Base Loan"        value={fmt$(baseLoan)} />
                    <Cell label="UFMIP (1.75%)"   value={fmt$(ufmip)} note="Financed into loan" />
                    <Cell label="Total Loan"       value={fmt$(loanAmt)} />
                    <Cell label="LTV"              value={fmtPct(ltv)} />
                </View>
                <Text style={[S.sectionHdr, { marginTop: 16 }]}>Monthly Breakdown</Text>
                <View style={S.grid}>
                    <Cell label="Principal & Interest" value={fmt$(pi) + '/mo'} note={`${fmtPct(rate)} · ${term}-yr fixed`} />
                    <Cell label="Annual MIP"            value={fmt$(mipMo) + '/mo'} note={fmtPct(mipRate * 100, 2) + '% of base loan'} />
                    <Cell label="Property Tax"          value={fmt$(taxMo) + '/mo'} />
                    <Cell label="Homeowner's Insurance" value={fmt$(insMo) + '/mo'} />
                    <Cell label="Total Interest Paid"   value={fmt$(totalInt)} note={`Over ${term} years`} />
                    <Cell label="Cash at Close (est.)"  value={fmt$(downAmt + price * 0.03)} note="Down + ~3% closing costs" />
                </View>
                <View style={S.disc}>
                    <Text style={S.discText}>
                        FHA MIP per HUD 2024 guidelines. UFMIP of 1.75% financed into loan amount. Annual MIP rate {fmtPct(mipRate * 100, 2)}%
                        (LTV {ltv > 90 ? '> 90%' : '≤ 90%'}). These figures are for educational purposes only and are not a Loan Estimate or pre-approval.
                        Actual rates and MIP depend on credit score, loan term, and FHA loan limits for your county.
                    </Text>
                    <View style={S.footer}>
                        <Text style={S.footerL}>chat.homerates.ai</Text>
                        <Text style={S.footerR}>© {new Date().getFullYear()} HomeRates.ai · For educational use only</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}

function VaDoc({ params }: { params: any }) {
    const { price = 600000, downPct = 0, rate = 6.75, term = 30, taxRate = 0.011, insRate = 0.004, vaFundingFeePct = 2.15 } = params;
    const downAmt    = price * (downPct / 100);
    const baseLoan   = price - downAmt;
    const ltv        = baseLoan / price * 100;
    const fundingFee = baseLoan * (vaFundingFeePct / 100);
    const loanAmt    = baseLoan + fundingFee;
    const pi         = calcPI(loanAmt, rate, term);
    const taxMo      = price * taxRate / 12;
    const insMo      = price * insRate / 12;
    const piti       = pi + taxMo + insMo;
    const pmiSaved   = baseLoan * 0.006 / 12;
    const totalInt   = calcTotalInterest(loanAmt, rate, term);

    return (
        <Document>
            <Page size="LETTER" style={S.page}>
                <View style={S.badge}><View style={S.badgeDot} /><Text style={S.badgeText}>HomeRates.ai — Mortgage Intelligence</Text></View>
                <Text style={S.title}>VA Loan Analysis</Text>
                <Text style={S.subtitle}>Generated {today()} · Estimates only — not a commitment to lend</Text>
                <View style={S.divider} />
                <View style={S.highlight}>
                    <Text style={S.hlLabel}>Total Monthly PITI (No PMI — VA benefit)</Text>
                    <Text style={S.hlValue}>{fmt$(piti)}/mo</Text>
                </View>
                <Text style={S.sectionHdr}>Loan Details</Text>
                <View style={S.grid}>
                    <Cell label="Purchase Price"    value={fmt$(price)} />
                    <Cell label="Down Payment"      value={fmt$(downAmt)} note={`${downPct}%`} />
                    <Cell label="Base Loan"         value={fmt$(baseLoan)} />
                    <Cell label={`Funding Fee (${fmtPct(vaFundingFeePct)})`} value={fmt$(fundingFee)} note="Financed into loan" />
                    <Cell label="Total Loan"        value={fmt$(loanAmt)} />
                    <Cell label="PMI Savings"       value={fmt$(pmiSaved) + '/mo'} note="vs. conventional (est.)" />
                </View>
                <Text style={[S.sectionHdr, { marginTop: 16 }]}>Monthly Breakdown</Text>
                <View style={S.grid}>
                    <Cell label="Principal & Interest" value={fmt$(pi) + '/mo'} note={`${fmtPct(rate)} · ${term}-yr fixed`} />
                    <Cell label="Property Tax"          value={fmt$(taxMo) + '/mo'} />
                    <Cell label="Homeowner's Insurance" value={fmt$(insMo) + '/mo'} />
                    <Cell label="Total Interest Paid"   value={fmt$(totalInt)} note={`Over ${term} years`} />
                    <Cell label="LTV (base)"            value={fmtPct(ltv)} />
                    <Cell label="Cash at Close (est.)"  value={fmt$(downAmt + price * 0.02)} note="Down + ~2% closing costs" />
                </View>
                <View style={S.disc}>
                    <Text style={S.discText}>
                        VA funding fee of {fmtPct(vaFundingFeePct)}% financed into loan per VA Pamphlet 26-7 (2024). No PMI required on VA-guaranteed loans.
                        Rates vary by lender, credit score, and lock timing. Fee rates may differ for National Guard, Reserve, and surviving spouses.
                        Educational estimates only — not a pre-approval or commitment to lend.
                    </Text>
                    <View style={S.footer}>
                        <Text style={S.footerL}>chat.homerates.ai</Text>
                        <Text style={S.footerR}>© {new Date().getFullYear()} HomeRates.ai · For educational use only</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}

function JumboDoc({ params }: { params: any }) {
    const { price = 2000000, downPct = 20, rate = 7.125, term = 30, taxRate = 0.011, insRate = 0.003 } = params;
    const downAmt  = price * (downPct / 100);
    const loanAmt  = price - downAmt;
    const ltv      = loanAmt / price * 100;
    const pi       = calcPI(loanAmt, rate, term);
    const taxMo    = price * taxRate / 12;
    const insMo    = price * insRate / 12;
    const total    = pi + taxMo + insMo;
    const totalInt = calcTotalInterest(loanAmt, rate, term);
    const reserve6 = total * 6;
    const reserve12= total * 12;

    return (
        <Document>
            <Page size="LETTER" style={S.page}>
                <View style={S.badge}><View style={S.badgeDot} /><Text style={S.badgeText}>HomeRates.ai — Mortgage Intelligence</Text></View>
                <Text style={S.title}>Jumbo Loan Analysis</Text>
                <Text style={S.subtitle}>Generated {today()} · Estimates only — not a commitment to lend</Text>
                <View style={S.divider} />
                <View style={S.highlight}>
                    <Text style={S.hlLabel}>Total Monthly Payment (PITI — No PMI at 20%+ down)</Text>
                    <Text style={S.hlValue}>{fmt$(total)}/mo</Text>
                </View>
                <Text style={S.sectionHdr}>Loan Details</Text>
                <View style={S.grid}>
                    <Cell label="Purchase Price"    value={fmt$(price)} />
                    <Cell label="Down Payment"      value={fmt$(downAmt)} note={`${downPct}%`} />
                    <Cell label="Loan Amount"       value={fmt$(loanAmt)} note="Exceeds 2026 conforming limit" />
                    <Cell label="Interest Rate"     value={fmtPct(rate)} note={`${term}-yr fixed`} />
                    <Cell label="LTV"               value={fmtPct(ltv)} />
                    <Cell label="Total Interest"    value={fmt$(totalInt)} note={`Over ${term} years`} />
                </View>
                <Text style={[S.sectionHdr, { marginTop: 16 }]}>Reserves Required (typical)</Text>
                <View style={S.grid}>
                    <Cell label="6-Month PITI Reserve"  value={fmt$(reserve6)} />
                    <Cell label="12-Month PITI Reserve" value={fmt$(reserve12)} />
                    <Cell label="Cash at Close (est.)"  value={fmt$(downAmt + price * 0.02)} note="Down + ~2% closing costs" />
                </View>
                <View style={S.disc}>
                    <Text style={S.discText}>
                        A jumbo loan exceeds the 2026 FHFA conforming baseline of $806,500 for a 1-unit standard-cost area residence.
                        Jumbo loans are portfolio products — rates and underwriting standards vary significantly by lender.
                        Well-qualified borrowers (720+ FICO, 20%+ down) may obtain rates at or below conforming.
                        Educational estimates only — not a pre-approval or commitment to lend.
                    </Text>
                    <View style={S.footer}>
                        <Text style={S.footerL}>chat.homerates.ai</Text>
                        <Text style={S.footerR}>© {new Date().getFullYear()} HomeRates.ai · For educational use only</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}

function AffordabilityDoc({ params }: { params: any }) {
    const { annualIncome = 150000, monthlyDebts = 0, savings = 50000, downPct = 5,
            rate = 7, term = 30, taxRate = 0.011, insRate = 0.004 } = params;
    // Back-calculate max home price at 43% DTI
    const maxMonthlyPayment = (annualIncome / 12) * 0.43 - monthlyDebts;
    const estimatedTaxInsRate = taxRate / 12 + insRate / 12; // as fraction of price per month
    // P&I = maxMonthly - tax - ins (iterative; approximate)
    // total ≈ PI + price*(taxRate+insRate)/12 => solve for price
    // Let down = price * downPct/100 → loan = price*(1-downPct/100)
    const loanFrac = 1 - downPct / 100;
    const r = rate / 100 / 12;
    const n = term * 12;
    const piPerLoan = r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    // maxMonthly = price*(loanFrac*piPerLoan + estimatedTaxInsRate)
    const maxPrice = maxMonthlyPayment / (loanFrac * piPerLoan + estimatedTaxInsRate);
    const maxLoan  = maxPrice * loanFrac;
    const downAmt  = maxPrice * (downPct / 100);
    const piMo     = calcPI(maxLoan, rate, term);
    const taxMo    = maxPrice * taxRate / 12;
    const insMo    = maxPrice * insRate / 12;
    const totalMo  = piMo + taxMo + insMo;
    const cashNeeded = downAmt + maxPrice * 0.025;

    return (
        <Document>
            <Page size="LETTER" style={S.page}>
                <View style={S.badge}><View style={S.badgeDot} /><Text style={S.badgeText}>HomeRates.ai — Mortgage Intelligence</Text></View>
                <Text style={S.title}>Affordability Analysis</Text>
                <Text style={S.subtitle}>Generated {today()} · Estimates only — not a commitment to lend</Text>
                <View style={S.divider} />
                <View style={S.highlight}>
                    <Text style={S.hlLabel}>Estimated Max Home Price @ 43% DTI</Text>
                    <Text style={S.hlValue}>{fmt$(maxPrice)}</Text>
                </View>
                <Text style={S.sectionHdr}>Income Profile</Text>
                <View style={S.grid}>
                    <Cell label="Annual Income"      value={fmt$(annualIncome)} note={fmt$(annualIncome / 12) + '/mo'} />
                    <Cell label="Monthly Debts"      value={fmt$(monthlyDebts) + '/mo'} />
                    <Cell label="Available Savings"  value={fmt$(savings)} />
                    <Cell label="DTI Target"         value="43% back-end" />
                    <Cell label="Down Payment"       value={`${downPct}%`} />
                    <Cell label="Rate Assumption"    value={fmtPct(rate)} note={`${term}-yr fixed`} />
                </View>
                <Text style={[S.sectionHdr, { marginTop: 16 }]}>At Max Home Price</Text>
                <View style={S.grid}>
                    <Cell label="Max Home Price"     value={fmt$(maxPrice)} />
                    <Cell label="Down Payment"       value={fmt$(downAmt)} note={`${downPct}%`} />
                    <Cell label="Loan Amount"        value={fmt$(maxLoan)} />
                    <Cell label="Monthly P&I"        value={fmt$(piMo) + '/mo'} />
                    <Cell label="Total Monthly PITI" value={fmt$(totalMo) + '/mo'} />
                    <Cell label="Cash Needed"        value={fmt$(cashNeeded)} note="Down + 2.5% closing" />
                </View>
                <View style={S.disc}>
                    <Text style={S.discText}>
                        Max home price estimated using 43% back-end DTI (industry standard qualifying ratio). Actual lender DTI limits vary by
                        loan program, credit score, and compensating factors. Rate seeded from live market data. Property tax at {fmtPct(taxRate * 100, 1)}%
                        and insurance at {fmtPct(insRate * 100, 1)}% annually are estimates. Cash-at-close estimate includes {downPct}% down + approx. 2.5% closing costs.
                        Educational estimates only — not a pre-approval or commitment to lend.
                    </Text>
                    <View style={S.footer}>
                        <Text style={S.footerL}>chat.homerates.ai</Text>
                        <Text style={S.footerR}>© {new Date().getFullYear()} HomeRates.ai · For educational use only</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}

function DscrDoc({ params }: { params: any }) {
    const { price = 500000, rent = 3500, downPct = 25, rate = 7.5, vacancyRate = 0.05,
            taxRate = 0.011, insRate = 0.005 } = params;
    const downAmt     = price * (downPct / 100);
    const loanAmt     = price - downAmt;
    const pi          = calcPI(loanAmt, rate, 30);
    const annualDebt  = pi * 12;
    const grossRent   = rent * 12;
    const egi         = grossRent * (1 - vacancyRate);
    const annualTax   = price * taxRate;
    const annualIns   = price * insRate;
    const annualExp   = annualTax + annualIns; // simplified (no mgmt/repairs)
    const noi         = egi - annualExp;
    const dscr        = noi / annualDebt;
    const taxMo       = annualTax / 12;
    const insMo       = annualIns / 12;
    const totalMo     = pi + taxMo + insMo;
    const cashFlow    = rent * (1 - vacancyRate) - totalMo;
    const cashOnCash  = (cashFlow * 12) / (downAmt + price * 0.03) * 100;

    return (
        <Document>
            <Page size="LETTER" style={S.page}>
                <View style={S.badge}><View style={S.badgeDot} /><Text style={S.badgeText}>HomeRates.ai — Mortgage Intelligence</Text></View>
                <Text style={S.title}>DSCR Loan Analysis</Text>
                <Text style={S.subtitle}>Generated {today()} · Estimates only — not a commitment to lend</Text>
                <View style={S.divider} />
                <View style={S.highlight}>
                    <Text style={S.hlLabel}>Debt Service Coverage Ratio</Text>
                    <Text style={S.hlValue}>{dscr.toFixed(2)}x {dscr >= 1.25 ? '✓ Strong' : dscr >= 1.0 ? '⚠ Qualifying' : '✗ Below Min'}</Text>
                </View>
                <Text style={S.sectionHdr}>Property & Loan</Text>
                <View style={S.grid}>
                    <Cell label="Purchase Price"    value={fmt$(price)} />
                    <Cell label="Down Payment"      value={fmt$(downAmt)} note={`${downPct}%`} />
                    <Cell label="Loan Amount"       value={fmt$(loanAmt)} />
                    <Cell label="Interest Rate"     value={fmtPct(rate)} note="30-yr fixed" />
                    <Cell label="Monthly P&I"       value={fmt$(pi) + '/mo'} />
                    <Cell label="Total PITIA"       value={fmt$(totalMo) + '/mo'} />
                </View>
                <Text style={[S.sectionHdr, { marginTop: 16 }]}>Income & Coverage</Text>
                <View style={S.grid}>
                    <Cell label="Market Rent"       value={fmt$(rent) + '/mo'} />
                    <Cell label="Vacancy Rate"      value={fmtPct(vacancyRate * 100, 0)} />
                    <Cell label="Eff. Gross Income" value={fmt$(egi / 12) + '/mo'} />
                    <Cell label="NOI (annual)"      value={fmt$(noi)} />
                    <Cell label="DSCR"              value={dscr.toFixed(2) + 'x'} />
                    <Cell label="Cash-on-Cash"      value={cashOnCash.toFixed(1) + '%'} note="Est. yr 1" />
                </View>
                <View style={S.disc}>
                    <Text style={S.discText}>
                        DSCR = Net Operating Income ÷ Annual Debt Service. NOI calculated as effective gross income (market rent × (1 − vacancy))
                        minus estimated annual taxes and insurance. Expenses do not include property management, repairs, or capex reserves.
                        Lenders typically require DSCR ≥ 1.0–1.25. Cash-on-cash return estimated using year-1 cash flow ÷ total cash invested
                        (down payment + ~3% closing costs). Educational estimates only — not a pre-approval or commitment to lend.
                    </Text>
                    <View style={S.footer}>
                        <Text style={S.footerL}>chat.homerates.ai</Text>
                        <Text style={S.footerR}>© {new Date().getFullYear()} HomeRates.ai · For educational use only</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}

function RefiDoc({ params }: { params: any }) {
    const { balance = 400000, currentRate = 7.5, newRate = 6.5, termMonths = 360, closingCosts = 6000 } = params;
    const termYears   = termMonths / 12;
    const oldPI       = calcPI(balance, currentRate, termYears);
    const newPI       = calcPI(balance, newRate, termYears);
    const monthlySav  = oldPI - newPI;
    const breakEven   = calcRefiBreakEven(closingCosts, oldPI, newPI);
    const oldTotalInt = calcTotalInterest(balance, currentRate, termYears);
    const newTotalInt = calcTotalInterest(balance, newRate, termYears);
    const intSavings  = oldTotalInt - newTotalInt;

    return (
        <Document>
            <Page size="LETTER" style={S.page}>
                <View style={S.badge}><View style={S.badgeDot} /><Text style={S.badgeText}>HomeRates.ai — Mortgage Intelligence</Text></View>
                <Text style={S.title}>Refinance Analysis</Text>
                <Text style={S.subtitle}>Generated {today()} · Estimates only — not a commitment to lend</Text>
                <View style={S.divider} />
                <View style={S.highlight}>
                    <Text style={S.hlLabel}>Monthly Savings After Refi</Text>
                    <Text style={S.hlValue}>{monthlySav > 0 ? fmt$(monthlySav) + '/mo saved' : 'No savings at these rates'}</Text>
                </View>
                <Text style={S.sectionHdr}>Current vs. New Loan</Text>
                <View style={S.grid}>
                    <Cell label="Loan Balance"      value={fmt$(balance)} />
                    <Cell label="Current Rate"      value={fmtPct(currentRate)} />
                    <Cell label="New Rate"          value={fmtPct(newRate)} />
                    <Cell label="Current Payment"   value={fmt$(oldPI) + '/mo'} />
                    <Cell label="New Payment"       value={fmt$(newPI) + '/mo'} />
                    <Cell label="Monthly Savings"   value={monthlySav > 0 ? fmt$(monthlySav) + '/mo' : 'N/A'} />
                </View>
                <Text style={[S.sectionHdr, { marginTop: 16 }]}>Break-Even & Long-Term</Text>
                <View style={S.grid}>
                    <Cell label="Closing Costs"     value={fmt$(closingCosts)} />
                    <Cell label="Break-Even"        value={isFinite(breakEven) ? Math.ceil(breakEven) + ' months' : 'Never'} />
                    <Cell label="Interest Savings"  value={fmt$(Math.max(0, intSavings))} note={`Over ${Math.round(termYears)} years`} />
                </View>
                <View style={S.disc}>
                    <Text style={S.discText}>
                        Refinance analysis compares principal & interest only. Monthly savings do not account for changes in remaining loan term,
                        taxes, or insurance. Break-even = closing costs ÷ monthly savings. Actual costs and savings depend on lender fees,
                        title, appraisal, and other third-party charges. Educational estimates only — not a commitment to lend.
                    </Text>
                    <View style={S.footer}>
                        <Text style={S.footerL}>chat.homerates.ai</Text>
                        <Text style={S.footerR}>© {new Date().getFullYear()} HomeRates.ai · For educational use only</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────

export type PdfType = 'conventional' | 'highbal' | 'fha' | 'va' | 'jumbo' | 'affordability' | 'dscr' | 'refi';

export function buildPdfDoc(type: PdfType, params: Record<string, unknown>) {
    switch (type) {
        case 'conventional':
        case 'highbal':    return <ConventionalDoc params={params} />;
        case 'fha':        return <FhaDoc params={params} />;
        case 'va':         return <VaDoc params={params} />;
        case 'jumbo':      return <JumboDoc params={params} />;
        case 'affordability': return <AffordabilityDoc params={params} />;
        case 'dscr':       return <DscrDoc params={params} />;
        case 'refi':       return <RefiDoc params={params} />;
        default:           return <ConventionalDoc params={params} />;
    }
}
