// lib/pdf/HomePDF.tsx
// PDF document templates for all HomeRates.ai slider card types
// Rendered server-side via @react-pdf/renderer in /api/pdf

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// ── Math helpers ──────────────────────────────────────────────────────────────
function calcPI(principal: number, annualRatePct: number, termMonths: number): number {
    if (annualRatePct === 0) return principal / termMonths;
    const r = annualRatePct / 100 / 12;
    return principal * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
}
function f$(n: number) { return `$${Math.round(Math.abs(n)).toLocaleString()}`; }
function fR(r: number) { return `${r.toFixed(2)}%`; }
function sign(n: number) { return n >= 0 ? '+' : '−'; }

// ── Colors & styles ───────────────────────────────────────────────────────────
const C = {
    green: '#059669', darkGreen: '#065f46',
    red: '#dc2626', amber: '#d97706',
    dark: '#0f172a', body: '#334155', muted: '#64748b',
    border: '#e2e8f0', bg: '#f8fafc', white: '#ffffff',
};

const s = StyleSheet.create({
    page: {
        fontFamily: 'Helvetica', fontSize: 9, color: C.body,
        paddingTop: 36, paddingBottom: 52, paddingHorizontal: 40,
        backgroundColor: C.white,
    },
    // Header
    header: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 12,
        paddingBottom: 10,
        borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: C.border,
    },
    brand: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.dark },
    brandSub: { fontSize: 7.5, color: C.muted, marginTop: 2 },
    headerRight: { alignItems: 'flex-end' },
    headerTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.dark },
    headerDate: { fontSize: 7.5, color: C.muted, marginTop: 2 },
    scenario: { fontSize: 8.5, color: C.muted, marginBottom: 12, fontFamily: 'Helvetica-Oblique' },
    // Section titles
    sectionTitle: {
        fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.muted,
        letterSpacing: 0.8,
        marginTop: 12, marginBottom: 5,
        paddingBottom: 3,
        borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: C.border,
    },
    // Hero row
    heroRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    heroBox: { flex: 1, borderRadius: 5, padding: 9, alignItems: 'center' },
    heroVal: { fontSize: 15, fontFamily: 'Helvetica-Bold', letterSpacing: -0.3 },
    heroLbl: { fontSize: 7, color: C.muted, marginTop: 3, textAlign: 'center' },
    // Two-col
    twoCol: { flexDirection: 'row', gap: 14 },
    col: { flex: 1 },
    // Data rows
    row: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 3.5,
        borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: C.border,
    },
    rowLabel: { color: C.muted, fontSize: 8.5 },
    rowVal: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.dark },
    rowValGreen: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.green },
    rowValRed: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.red },
    rowValAmber: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.amber },
    // Total row
    totalRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 4, paddingHorizontal: 5,
        backgroundColor: C.bg, marginTop: 2, borderRadius: 3,
    },
    totalLbl: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.dark },
    totalVal: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark },
    // Disclaimer
    discBox: {
        marginTop: 18, padding: 9,
        backgroundColor: C.bg, borderRadius: 4,
        borderWidth: 0.5, borderStyle: 'solid', borderColor: C.border,
    },
    discTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 4 },
    discText: { fontSize: 6.8, color: C.muted, lineHeight: 1.5 },
    // Footer
    footer: {
        position: 'absolute', bottom: 18, left: 40, right: 40,
        flexDirection: 'row', justifyContent: 'space-between',
        fontSize: 6.5, color: C.muted,
        borderTopWidth: 0.5, borderTopStyle: 'solid', borderTopColor: C.border, paddingTop: 4,
    },
});

// ── Shared sub-components ─────────────────────────────────────────────────────

function PDFHeader({ title, scenario }: { title: string; scenario: string }) {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return (
        <>
            <View style={s.header}>
                <View>
                    <Text style={s.brand}>HomeRates.ai</Text>
                    <Text style={s.brandSub}>Educational Mortgage Analysis</Text>
                </View>
                <View style={s.headerRight}>
                    <Text style={s.headerTitle}>{title}</Text>
                    <Text style={s.headerDate}>Generated {today}</Text>
                </View>
            </View>
            <Text style={s.scenario}>{scenario}</Text>
        </>
    );
}

function Sec({ children }: { children: string }) {
    return <Text style={s.sectionTitle}>{children.toUpperCase()}</Text>;
}

type RowColor = 'green' | 'red' | 'amber';
function Row({ label, value, color }: { label: string; value: string; color?: RowColor }) {
    const vs = color === 'green' ? s.rowValGreen : color === 'red' ? s.rowValRed : color === 'amber' ? s.rowValAmber : s.rowVal;
    return (
        <View style={s.row}>
            <Text style={s.rowLabel}>{label}</Text>
            <Text style={vs}>{value}</Text>
        </View>
    );
}

function Total({ label, value, color }: { label: string; value: string; color?: 'green' | 'red' }) {
    const c = color === 'green' ? C.green : color === 'red' ? C.red : C.dark;
    return (
        <View style={s.totalRow}>
            <Text style={s.totalLbl}>{label}</Text>
            <Text style={[s.totalVal, { color: c }]}>{value}</Text>
        </View>
    );
}

function Hero({ value, label, pos }: { value: string; label: string; pos?: boolean | null }) {
    const bg  = pos === true ? '#f0fdf4' : pos === false ? '#fef2f2' : C.bg;
    const bdr = pos === true ? '#6ee7b7' : pos === false ? '#fca5a5' : C.border;
    const clr = pos === true ? C.green  : pos === false ? C.red     : C.dark;
    return (
        <View style={[s.heroBox, { backgroundColor: bg, borderWidth: 1, borderStyle: 'solid', borderColor: bdr }]}>
            <Text style={[s.heroVal, { color: clr }]}>{value}</Text>
            <Text style={s.heroLbl}>{label}</Text>
        </View>
    );
}

function Disclaimer() {
    return (
        <View style={s.discBox}>
            <Text style={s.discTitle}>Important Disclosures — Educational Content Only</Text>
            <Text style={s.discText}>
                This document is provided for general educational and informational purposes only. HomeRates.ai is an independent educational platform and is NOT a mortgage lender, mortgage broker, or financial institution. HomeRates.ai does not originate loans, provide credit decisions, issue commitments to lend, or determine qualification, approval, or denial for any mortgage program.{'\n\n'}
                All figures shown are hypothetical estimates based solely on the inputs provided. They do not constitute a Loan Estimate (LE), Closing Disclosure (CD), pre-qualification, pre-approval, or any offer to extend credit. Actual mortgage rates, payments, closing costs, qualifying criteria, and program availability will vary based on your credit profile, income, assets, property characteristics, lender guidelines, and market conditions at the time of application.{'\n\n'}
                Nothing in this document should be interpreted as financial advice, legal advice, tax advice, investment advice, or personalized mortgage guidance. Users are solely responsible for verifying all information with a licensed mortgage lender or qualified professional before making any financial decision. HomeRates.ai and its operators shall not be liable for any decisions made based on information contained in this document.{'\n\n'}
                Full Terms & Disclosures: homerates.ai/disclosures  |  support@homerates.ai
            </Text>
        </View>
    );
}

function Footer() {
    return (
        <View style={s.footer} fixed>
            <Text>HomeRates.ai — For educational use only — Not a commitment to lend — homerates.ai/disclosures</Text>
            <Text render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
    );
}

// ── REFI PDF ──────────────────────────────────────────────────────────────────

export interface RefiPdfParams {
    balance: number;
    currentRate: number;
    newRate: number;
    termMonths: number;
    closingCosts: number;
}

export function RefiPDF({ balance, currentRate, newRate, termMonths, closingCosts }: RefiPdfParams) {
    const oldPI     = calcPI(balance, currentRate, 360);
    const newPI     = calcPI(balance, newRate, termMonths);
    const savings   = oldPI - newPI;
    const beMo: number | null = savings > 0 && closingCosts > 0 ? Math.ceil(closingCosts / savings) : savings > 0 ? 0 : null;
    const net5yr    = Math.round(savings * 60  - closingCosts);
    const net10yr   = Math.round(savings * 120 - closingCosts);
    const oldInt    = Math.round(oldPI * 360 - balance);
    const newInt    = Math.round(newPI * termMonths - balance);
    const intSaved  = oldInt - newInt;
    const rateDrop  = currentRate - newRate;
    const termYears = termMonths / 12;

    const beLabel   = beMo === null ? 'No savings' : beMo === 0 ? 'Immediate' : `${beMo} months`;
    const bePos     = beMo !== null && beMo <= 36;

    const scenario = `${f$(balance)} balance  ·  ${fR(currentRate)} → ${fR(newRate)}  ·  ${termYears}-year fixed  ·  ${f$(closingCosts)} closing costs`;

    return (
        <Document title="Refinance Analysis — HomeRates.ai" author="HomeRates.ai">
            <Page size="LETTER" style={s.page}>
                <PDFHeader title="Refinance Analysis" scenario={scenario} />

                <View style={s.heroRow}>
                    <Hero value={`${sign(savings)}${f$(savings)}/mo`} label="Monthly Savings" pos={savings > 0} />
                    <Hero value={beLabel}                             label="Break-Even"       pos={bePos} />
                    <Hero value={`${sign(net5yr)}${f$(net5yr)}`}     label="5-Year Net"        pos={net5yr > 0} />
                </View>

                <View style={s.twoCol}>
                    <View style={s.col}>
                        <Sec>PAYMENT COMPARISON</Sec>
                        <Row label="Current monthly P&I"                value={`${f$(oldPI)}/mo`} />
                        <Row label={`New monthly P&I (${termYears}yr)`} value={`${f$(newPI)}/mo`} />
                        <Total label="Monthly savings" value={`${sign(savings)}${f$(savings)}/mo`} color={savings > 0 ? 'green' : 'red'} />

                        <Sec>INTEREST ANALYSIS</Sec>
                        <Row label="Remaining interest (current loan)"     value={f$(oldInt)} />
                        <Row label={`Total interest (new ${termYears}yr)`} value={f$(newInt)} />
                        <Total label={`Lifetime interest ${intSaved >= 0 ? 'saved' : 'added'}`} value={`${sign(intSaved)}${f$(intSaved)}`} color={intSaved >= 0 ? 'green' : 'red'} />
                    </View>

                    <View style={s.col}>
                        <Sec>NET SAVINGS MILESTONES</Sec>
                        <Row label="Annual savings"     value={`${sign(savings * 12)}${f$(savings * 12)}/yr`} color={savings > 0 ? 'green' : 'red'} />
                        <Row label="10-year net"        value={`${sign(net10yr)}${f$(net10yr)}`} color={net10yr > 0 ? 'green' : 'red'} />
                        <Row label="Rate improvement"   value={`${rateDrop > 0 ? '↓' : '↑'} ${Math.abs(rateDrop).toFixed(3)}%`} color={rateDrop > 0 ? 'green' : 'red'} />

                        <Sec>INPUTS USED</Sec>
                        <Row label="Loan balance"   value={f$(balance)} />
                        <Row label="Current rate"   value={fR(currentRate)} />
                        <Row label="New rate"       value={fR(newRate)} />
                        <Row label="New term"       value={`${termYears} years`} />
                        <Row label="Closing costs"  value={f$(closingCosts)} />
                    </View>
                </View>

                <Disclaimer />
                <Footer />
            </Page>
        </Document>
    );
}

// ── CONVENTIONAL / FHA PDF ────────────────────────────────────────────────────

export interface ConvFhaPdfParams {
    price: number;
    downPct: number;
    rate: number;
    term: number;       // years
    taxRate: number;
    insRate: number;
    loanType: 'conventional' | 'fha';
}

export function ConvFhaPDF({ price, downPct, rate, term, taxRate, insRate, loanType }: ConvFhaPdfParams) {
    const downAmt  = price * downPct / 100;
    const baseLoan = price - downAmt;
    const ufmip    = loanType === 'fha' ? baseLoan * 0.0175 : 0;
    const loanAmt  = loanType === 'fha' ? baseLoan + ufmip : baseLoan;
    const termMo   = term * 12;
    const pi       = calcPI(loanAmt, rate, termMo);
    const tax      = (price * taxRate)  / 12;
    const ins      = (price * insRate)  / 12;
    const mip      = loanType === 'fha' ? (baseLoan * 0.0055) / 12 : 0;
    const pmi      = (loanType === 'conventional' && downPct < 20) ? (loanAmt * 0.0052) / 12 : 0;
    const total    = pi + tax + ins + mip + pmi;
    const totalInt = Math.round(pi * termMo - loanAmt);
    const ltv      = (loanAmt / price) * 100;
    const prog     = loanType === 'fha' ? 'FHA' : 'Conventional';

    const scenario = `${f$(price)} home  ·  ${downPct}% down (${f$(downAmt)})  ·  ${fR(rate)}  ·  ${term}-year ${prog}`;

    return (
        <Document title={`${prog} Loan Analysis — HomeRates.ai`} author="HomeRates.ai">
            <Page size="LETTER" style={s.page}>
                <PDFHeader title={`${prog} Loan Analysis`} scenario={scenario} />

                <View style={s.heroRow}>
                    <Hero value={`${f$(Math.round(total))}/mo`} label="Total Monthly PITI" />
                    <Hero value={`${f$(Math.round(pi))}/mo`}    label="P&I Payment" />
                    <Hero value={f$(totalInt)}                  label="Total Interest" pos={false} />
                </View>

                <View style={s.twoCol}>
                    <View style={s.col}>
                        <Sec>LOAN STRUCTURE</Sec>
                        <Row label="Purchase price"                            value={f$(price)} />
                        <Row label="Down payment"                              value={`${f$(Math.round(downAmt))} (${downPct}%)`} />
                        <Row label={loanType === 'fha' ? 'Base loan amount' : 'Loan amount'} value={f$(Math.round(baseLoan))} />
                        {loanType === 'fha' && <Row label="UFMIP (1.75%)"    value={f$(Math.round(ufmip))} />}
                        {loanType === 'fha' && <Row label="Total loan amount" value={f$(Math.round(loanAmt))} />}
                        <Row label="LTV"                                       value={`${ltv.toFixed(1)}%`} />

                        <Sec>MONTHLY PAYMENT BREAKDOWN</Sec>
                        <Row label="Principal & Interest"    value={`${f$(Math.round(pi))}/mo`} />
                        <Row label="Property Tax (est.)"     value={`${f$(Math.round(tax))}/mo`} />
                        <Row label="Homeowners Insurance"    value={`${f$(Math.round(ins))}/mo`} />
                        {pmi > 0 && <Row label="PMI (est.)"  value={`${f$(Math.round(pmi))}/mo`} color="amber" />}
                        {mip > 0 && <Row label="MIP (monthly)" value={`${f$(Math.round(mip))}/mo`} color="amber" />}
                        <Total label="Total Monthly Payment" value={`${f$(Math.round(total))}/mo`} />
                    </View>

                    <View style={s.col}>
                        <Sec>COST SUMMARY</Sec>
                        <Row label="Total interest paid"    value={f$(totalInt)} />
                        <Row label="Total of all payments"  value={f$(Math.round(pi * termMo))} />
                        {loanType === 'fha'             && <Row label="MIP duration"     value={downPct >= 10 ? '11 years' : 'Life of loan'} color="amber" />}
                        {loanType === 'conventional' && downPct < 20 && <Row label="PMI cancels at" value="80% LTV" />}

                        <Sec>INPUTS USED</Sec>
                        <Row label="Purchase price"     value={f$(price)} />
                        <Row label="Down payment"       value={`${downPct}%`} />
                        <Row label="Interest rate"      value={fR(rate)} />
                        <Row label="Loan term"          value={`${term} years`} />
                        <Row label="Loan type"          value={prog} />
                        <Row label="Tax rate (est.)"    value={`${(taxRate * 100).toFixed(2)}%/yr`} />
                        <Row label="Insurance (est.)"   value={`${(insRate * 100).toFixed(2)}%/yr`} />
                    </View>
                </View>

                <Disclaimer />
                <Footer />
            </Page>
        </Document>
    );
}

// ── AFFORDABILITY PDF ─────────────────────────────────────────────────────────

export interface AffordabilityPdfParams {
    annualIncome: number;
    monthlyDebts: number;
    savings: number;
    downPct: number;
    rate: number;
    term: number;
    taxRate: number;
    insRate: number;
    loanType: 'conventional' | 'fha';
}

export function AffordabilityPDF({ annualIncome, monthlyDebts, savings, downPct, rate, term, taxRate, insRate, loanType }: AffordabilityPdfParams) {
    const monthlyIncome = annualIncome / 12;
    const dtiMax = monthlyIncome * 0.43 - monthlyDebts;

    // Binary search for max home price at 43% back-end DTI
    let lo = 0, hi = 5_000_000, maxPrice = 0;
    for (let i = 0; i < 60; i++) {
        const mid  = (lo + hi) / 2;
        const down = mid * downPct / 100;
        const loan = loanType === 'fha' ? (mid - down) * 1.0175 : mid - down;
        const pmt  = calcPI(loan, rate, term * 12) + (mid * taxRate) / 12 + (mid * insRate) / 12;
        if (pmt <= dtiMax) { maxPrice = mid; lo = mid; } else { hi = mid; }
    }
    maxPrice = Math.round(maxPrice / 1000) * 1000;

    const down          = maxPrice * downPct / 100;
    const loan          = loanType === 'fha' ? (maxPrice - down) * 1.0175 : maxPrice - down;
    const pi            = calcPI(loan, rate, term * 12);
    const tax           = (maxPrice * taxRate) / 12;
    const ins           = (maxPrice * insRate) / 12;
    const total         = pi + tax + ins;
    const housingDTI    = (total / monthlyIncome) * 100;
    const totalDTI      = ((total + monthlyDebts) / monthlyIncome) * 100;
    const closingEst    = maxPrice * 0.03;
    const cashNeeded    = down + closingEst;
    const gap           = savings - cashNeeded;

    const scenario = `${f$(Math.round(annualIncome))}/yr income  ·  ${f$(monthlyDebts)}/mo debts  ·  ${downPct}% down  ·  ${fR(rate)}  ·  ${loanType.toUpperCase()}`;

    return (
        <Document title="Affordability Analysis — HomeRates.ai" author="HomeRates.ai">
            <Page size="LETTER" style={s.page}>
                <PDFHeader title="Affordability Analysis" scenario={scenario} />

                <View style={s.heroRow}>
                    <Hero value={f$(maxPrice)}                      label="Max Home Price"  pos={true} />
                    <Hero value={`${f$(Math.round(total))}/mo`}     label="Est. PITI/mo" />
                    <Hero value={`${totalDTI.toFixed(1)}%`}         label="Total DTI"
                          pos={totalDTI <= 36 ? true : totalDTI <= 43 ? null : false} />
                </View>

                <View style={s.twoCol}>
                    <View style={s.col}>
                        <Sec>MONTHLY PAYMENT</Sec>
                        <Row label="Principal & Interest"  value={`${f$(Math.round(pi))}/mo`} />
                        <Row label="Property Tax (est.)"   value={`${f$(Math.round(tax))}/mo`} />
                        <Row label="Homeowners Insurance"  value={`${f$(Math.round(ins))}/mo`} />
                        <Total label="Total Monthly PITI"  value={`${f$(Math.round(total))}/mo`} />

                        <Sec>DTI ANALYSIS</Sec>
                        <Row label="Gross monthly income"  value={`${f$(Math.round(monthlyIncome))}/mo`} />
                        <Row label="Housing payment"       value={`${f$(Math.round(total))}/mo`} />
                        <Row label="Other monthly debts"   value={`${f$(monthlyDebts)}/mo`} />
                        <Row label="Housing DTI"           value={`${housingDTI.toFixed(1)}%`}
                             color={housingDTI <= 28 ? 'green' : housingDTI <= 36 ? undefined : 'amber'} />
                        <Row label="Total back-end DTI"    value={`${totalDTI.toFixed(1)}%`}
                             color={totalDTI <= 36 ? 'green' : totalDTI <= 43 ? 'amber' : 'red'} />
                    </View>

                    <View style={s.col}>
                        <Sec>CASH NEEDED TO CLOSE</Sec>
                        <Row label={`Down payment (${downPct}%)`} value={f$(Math.round(down))} />
                        <Row label="Est. closing costs (3%)"      value={f$(Math.round(closingEst))} />
                        <Total label="Total cash needed"          value={f$(Math.round(cashNeeded))} />
                        <Row label="Savings available"            value={f$(savings)} color={gap >= 0 ? 'green' : 'red'} />
                        <Row label={gap >= 0 ? 'Surplus' : 'Gap'} value={`${sign(gap)}${f$(Math.abs(gap))}`} color={gap >= 0 ? 'green' : 'red'} />

                        <Sec>INPUTS USED</Sec>
                        <Row label="Annual income"    value={f$(annualIncome)} />
                        <Row label="Monthly debts"    value={`${f$(monthlyDebts)}/mo`} />
                        <Row label="Savings"          value={f$(savings)} />
                        <Row label="Down payment"     value={`${downPct}%`} />
                        <Row label="Interest rate"    value={fR(rate)} />
                        <Row label="Loan term"        value={`${term} years`} />
                        <Row label="Loan type"        value={loanType.toUpperCase()} />
                    </View>
                </View>

                <Disclaimer />
                <Footer />
            </Page>
        </Document>
    );
}

// ── DSCR PDF ──────────────────────────────────────────────────────────────────

export interface DscrPdfParams {
    price: number;
    rent: number;
    downPct: number;
    rate: number;
    vacancyRate: number;    // 0–1 decimal
    taxRate: number;
    insRate: number;
    mgmtPct?: number;       // integer 0 or 8
}

export function DscrPDF({ price, rent, downPct, rate, vacancyRate, taxRate, insRate, mgmtPct = 0 }: DscrPdfParams) {
    const MAINT = 0.01;
    const down          = price * downPct / 100;
    const loan          = price - down;
    const pi            = calcPI(loan, rate, 360);
    const tax           = (price * taxRate) / 12;
    const ins           = (price * insRate) / 12;
    const pitia         = pi + tax + ins;
    const effectiveRent = rent * (1 - vacancyRate);
    const dscr          = pitia > 0 ? effectiveRent / pitia : 0;
    const maint         = (price * MAINT) / 12;
    const mgmt          = rent * (mgmtPct / 100);
    const cashFlow      = effectiveRent - pitia - maint - mgmt;
    const ltv           = (loan / price) * 100;
    const grossYield    = (rent * 12 / price) * 100;
    const rentFor100    = Math.ceil(pitia / (1 - vacancyRate));
    const rentFor125    = Math.ceil(pitia * 1.25 / (1 - vacancyRate));

    const dscrColor = dscr >= 1.25 ? 'green' : dscr >= 1.0 ? 'amber' : 'red';
    const dscrLabel = dscr >= 1.5  ? 'Excellent' : dscr >= 1.25 ? 'Qualifies ≥1.25x' : dscr >= 1.0 ? 'Borderline 1.0–1.24x' : 'Does Not Qualify <1.0x';

    const scenario = `${f$(price)} property  ·  ${f$(rent)}/mo rent  ·  ${downPct}% down  ·  ${fR(rate)}${vacancyRate > 0 ? `  ·  ${(vacancyRate * 100).toFixed(0)}% vacancy` : ''}`;

    return (
        <Document title="DSCR Investment Analysis — HomeRates.ai" author="HomeRates.ai">
            <Page size="LETTER" style={s.page}>
                <PDFHeader title="DSCR Investment Analysis" scenario={scenario} />

                <View style={s.heroRow}>
                    <Hero value={`${dscr.toFixed(2)}x`}                          label={dscrLabel}      pos={dscr >= 1.25 ? true : dscr >= 1.0 ? null : false} />
                    <Hero value={`${sign(cashFlow)}${f$(cashFlow)}/mo`}           label="Investor Cash Flow" pos={cashFlow >= 0} />
                    <Hero value={`${sign(cashFlow * 12)}${f$(cashFlow * 12)}/yr`} label="Annual Cash Flow"   pos={cashFlow >= 0} />
                </View>

                <View style={s.twoCol}>
                    <View style={s.col}>
                        <Sec>DSCR CALCULATION (LENDER VIEW)</Sec>
                        <Row label="Gross monthly rent"  value={`${f$(rent)}/mo`} />
                        {vacancyRate > 0 && (
                            <Row label={`Vacancy loss (${(vacancyRate * 100).toFixed(0)}%)`}
                                 value={`−${f$(Math.round(rent * vacancyRate))}/mo`} color="red" />
                        )}
                        {vacancyRate > 0 && (
                            <Row label="Effective gross income" value={`${f$(Math.round(effectiveRent))}/mo`} />
                        )}
                        <Row label="Monthly PITIA"       value={`${f$(Math.round(pitia))}/mo`} />
                        <Total label={`DSCR = ${f$(Math.round(effectiveRent))} ÷ ${f$(Math.round(pitia))}`}
                               value={`${dscr.toFixed(2)}x`} color={dscrColor === 'green' ? 'green' : dscrColor === 'red' ? 'red' : undefined} />

                        <Sec>CASH FLOW (INVESTOR VIEW)</Sec>
                        <Row label="Effective rent"                      value={`${f$(Math.round(effectiveRent))}/mo`} />
                        <Row label="PITIA"                               value={`−${f$(Math.round(pitia))}/mo`} />
                        <Row label="Maintenance (1%/yr est.)"            value={`−${f$(Math.round(maint))}/mo`} />
                        {mgmtPct > 0 && <Row label={`Property mgmt (${mgmtPct}%)`} value={`−${f$(Math.round(mgmt))}/mo`} />}
                        <Total label="Net monthly cash flow" value={`${sign(cashFlow)}${f$(cashFlow)}/mo`} color={cashFlow >= 0 ? 'green' : 'red'} />
                    </View>

                    <View style={s.col}>
                        <Sec>MONTHLY PITIA BREAKDOWN</Sec>
                        <Row label="Principal & Interest"   value={`${f$(Math.round(pi))}/mo`} />
                        <Row label="Property Tax (est.)"    value={`${f$(Math.round(tax))}/mo`} />
                        <Row label="Insurance (est.)"       value={`${f$(Math.round(ins))}/mo`} />
                        <Total label="Total PITIA"          value={`${f$(Math.round(pitia))}/mo`} />

                        <Sec>THRESHOLDS & METRICS</Sec>
                        <Row label="Rent for 1.0x DSCR"    value={`${f$(rentFor100)}/mo`} color={rent >= rentFor100 ? 'green' : 'red'} />
                        <Row label="Rent for 1.25x DSCR"   value={`${f$(rentFor125)}/mo`} color={rent >= rentFor125 ? 'green' : 'amber'} />
                        <Row label="LTV"                    value={`${ltv.toFixed(1)}%`} />
                        <Row label="Gross yield"            value={`${grossYield.toFixed(2)}%/yr`} />
                        <Row label="Loan amount"            value={f$(Math.round(loan))} />
                        <Row label="Down payment"           value={`${f$(Math.round(down))} (${downPct}%)`} />
                    </View>
                </View>

                <Disclaimer />
                <Footer />
            </Page>
        </Document>
    );
}
