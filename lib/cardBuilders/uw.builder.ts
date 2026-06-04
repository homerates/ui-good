import { BuiltCard } from './types';

export interface UWCardInput {
    question: string;
    answerMarkdown: string;
    source?: string;
    sourceUrl?: string;
    elapsedMs?: number;
}

function uwTopic(q: string) {
    const t = q.toLowerCase();
    return {
        isMIP: /\bmip\b|ufmip|mortgage insurance premium/i.test(q),
        isFHA: /\bfha\b/i.test(q),
        isConv: /conventional|fannie|freddie/i.test(q),
        isVA: /\bva\b|veteran|funding fee|coe\b|entitlement/i.test(q),
        isUSDA: /\busda\b|rural development/i.test(q),
        isDSCR: /\bdscr\b|debt service/i.test(q),
        isDTI: /\bdti\b|debt.to.income/i.test(q),
        isCredit: /credit score|fico/i.test(q),
        isDown: /down payment|ltv|loan.to.value/i.test(q),
        isPMI: /\bpmi\b/i.test(q),
        isPMICancel: /cancel|remov|drop|stop|go away|78|80/i.test(q) && /\bpmi\b/i.test(q),
        isMIPCancel: /remov|cancel|get rid|eliminate/i.test(q) && /\bmip\b/i.test(q),
        isLimits: /loan limit|conforming|jumbo|high.balance/i.test(q),
        isReserves: /reserve|months of/i.test(q),
        isGift: /gift fund/i.test(q),
        isSelfEmp: /self.employ/i.test(q),
        isJumbo: /jumbo|non.?conforming/i.test(q),
        isFHAvsConv: /fha.{0,20}conven|conven.{0,20}fha/i.test(q),
        isEmploy: /employment|work history|job/i.test(q),
        isAppraisal: /apprais/i.test(q),
        isEscrow: /escrow/i.test(q),
        isClosing: /closing cost|closing disclosure|cd\b|settlement/i.test(q),
        isLockRate: /rate lock|lock.{0,10}rate/i.test(q),
        isRefi: /refinanc|refi/i.test(q),
        isWaiting: /waiting period|after bankruptcy|after foreclosure/i.test(q),
        isManualUW: /manual underwriting|aus\b|du\b|lp\b|automated/i.test(q),
        isIncome: /income.{0,20}(doc|qualify|calculat)/i.test(q),
    };
}

function generateUWFollowUpChips(q: string): Array<{ label: string; seed: string }> {
    const tp = uwTopic(q);

    if (tp.isFHAvsConv) return [
        { label: 'FHA vs conventional loan limits in 2026', seed: 'Ask Underwriting: what are the FHA and conventional conforming loan limits for 2026?' },
        { label: 'FHA gift funds vs conventional — which is more flexible?', seed: 'Ask Underwriting: compare gift fund rules for FHA vs conventional loans — who is more flexible?' },
        { label: 'How does self-employed income differ for FHA vs conventional?', seed: 'Ask Underwriting: how does self-employed income documentation differ between FHA and conventional?' },
        { label: 'FHA vs conventional DTI limits — complete comparison', seed: 'Ask Underwriting: compare DTI limits across FHA and conventional — what compensating factors help?' },
    ];

    if (tp.isPMICancel) return [
        { label: 'Can a new appraisal remove PMI early?', seed: 'Ask Underwriting: can a new appraisal help me remove PMI before 78% LTV on a conventional loan?' },
        { label: 'PMI vs FHA MIP — total cost over 7 years', seed: 'Ask Underwriting: how does total conventional PMI cost compare to FHA MIP over 5 and 10 years?' },
        { label: 'What is lender-paid PMI and when does it make sense?', seed: 'Ask Underwriting: what is lender-paid PMI vs borrower-paid PMI — when does each make sense?' },
        { label: 'Automatic PMI removal — what triggers it?', seed: 'Ask Underwriting: when does PMI automatically cancel vs when must I request it on a conventional loan?' },
    ];

    if (tp.isMIPCancel) return [
        { label: 'Refinance FHA → conventional to kill MIP', seed: 'Ask Underwriting: when can I refinance from FHA to conventional to permanently eliminate MIP?' },
        { label: 'What LTV do I need to remove FHA MIP?', seed: 'Ask Underwriting: what LTV is required to remove MIP on an FHA loan — does it differ by origination date?' },
        { label: 'FHA MIP vs conventional PMI — total cost comparison', seed: 'Ask Underwriting: compare the total cost of FHA MIP vs conventional PMI over 5 and 10 years' },
        { label: 'Extra payments to hit 20% equity faster', seed: 'Ask Underwriting: how do extra principal payments help me exit FHA MIP sooner?' },
    ];

    if (tp.isMIP || (tp.isFHA && !tp.isConv)) return [
        { label: 'FHA MIP vs conventional PMI — which costs more?', seed: 'Ask Underwriting: how does FHA MIP compare to conventional PMI — rates, duration, and cancellation?' },
        { label: 'What credit score do I need for FHA 3.5% down?', seed: 'Ask Underwriting: what credit score is required for FHA 3.5% down — and what happens at 580 vs 640?' },
        { label: 'FHA after bankruptcy — what are the waiting periods?', seed: 'Ask Underwriting: what are the FHA waiting period requirements after Chapter 7 vs Chapter 13 bankruptcy?' },
        { label: 'FHA loan limits for 2026 — floor and ceiling', seed: 'Ask Underwriting: what are the FHA loan limits for 2026 — national floor, ceiling, and high-cost areas?' },
    ];

    if (tp.isGift) return [
        { label: 'Gift fund rules — FHA vs conventional vs VA', seed: 'Ask Underwriting: compare gift fund rules across FHA, conventional, VA, and USDA loans' },
        { label: 'Can gift funds be used for investment properties?', seed: 'Ask Underwriting: are gift funds allowed for investment property down payments on any loan type?' },
        { label: 'What documentation is required for gift funds?', seed: 'Ask Underwriting: what documentation is required to use gift funds — gift letter, bank statements, transfers?' },
        { label: 'Gift fund seasoning — how long must funds be in account?', seed: 'Ask Underwriting: do gift funds need to be seasoned before closing on FHA or conventional?' },
    ];

    if (tp.isPMI || (tp.isConv && !tp.isFHA)) return [
        { label: 'Can appreciation help remove PMI early?', seed: 'Ask Underwriting: can a new appraisal help me cancel PMI before 78% LTV on a conventional loan?' },
        { label: 'What DTI limits apply to conventional loans?', seed: 'Ask Underwriting: what are the DTI limits for conventional — and what compensating factors allow higher DTI?' },
        { label: 'Conventional gift fund rules by property type', seed: 'Ask Underwriting: what are the gift fund rules for conventional loans — primary vs second home vs investment?' },
        { label: 'Conventional loan limits for 2026', seed: 'Ask Underwriting: what are the 2026 conventional conforming loan limits including high-balance counties?' },
    ];

    if (tp.isVA) return [
        { label: 'VA funding fee — who is exempt?', seed: 'Ask Underwriting: explain the VA funding fee — rates, exemptions, and when it applies for first vs subsequent use' },
        { label: 'How does VA entitlement work — first and subsequent use?', seed: 'Ask Underwriting: how does VA loan entitlement work, including restoration after selling?' },
        { label: 'VA vs conventional — key underwriting differences', seed: 'Ask Underwriting: what are the main underwriting differences between VA and conventional loans?' },
        { label: 'Can I use VA if I still have a VA loan?', seed: 'Ask Underwriting: can I use VA loan eligibility if I already have an active VA mortgage?' },
    ];

    if (tp.isUSDA) return [
        { label: 'How do USDA income limits work?', seed: 'Ask Underwriting: how are USDA income limits calculated — and where do I check my household eligibility?' },
        { label: 'USDA vs FHA — total costs and eligibility', seed: 'Ask Underwriting: compare USDA and FHA loan total costs, fees, and eligibility requirements' },
        { label: 'What properties qualify for USDA?', seed: 'Ask Underwriting: how do I determine if a property location qualifies for a USDA loan?' },
        { label: 'USDA guarantee fee — upfront and annual', seed: 'Ask Underwriting: what is the USDA guarantee fee — upfront and annual amounts for 2026?' },
    ];

    if (tp.isDSCR) return [
        { label: 'What DSCR ratio do most lenders require?', seed: 'Ask Underwriting: what DSCR ratio is typically required and how does it affect rate and terms?' },
        { label: 'How is DSCR income calculated — what counts?', seed: 'Ask Underwriting: how is DSCR calculated — what income counts and does vacancy factor in?' },
        { label: 'DSCR vs conventional investment loan — key differences', seed: 'Ask Underwriting: what are the underwriting differences between DSCR and conventional investment property loans?' },
        { label: 'DSCR reserve requirements — how many months?', seed: 'Ask Underwriting: how many months of reserves are required for DSCR loans vs conventional investment loans?' },
    ];

    if (tp.isDTI) return [
        { label: 'DTI limits across all loan types — complete table', seed: 'Ask Underwriting: compare DTI limits for FHA, conventional, VA, and USDA — front-end and back-end' },
        { label: 'What debts count in DTI — and what is excluded?', seed: 'Ask Underwriting: what monthly debts are included in DTI calculation — and what is excluded?' },
        { label: 'Compensating factors that allow higher DTI', seed: 'Ask Underwriting: what compensating factors allow DTI above 45% for conventional loan approval?' },
        { label: 'How is DTI calculated for self-employed borrowers?', seed: 'Ask Underwriting: how is DTI calculated differently for self-employed borrowers on FHA and conventional?' },
    ];

    if (tp.isCredit) return [
        { label: 'Credit score minimums by loan type — full table', seed: 'Ask Underwriting: what are the minimum credit score requirements for FHA, conventional, VA, and USDA?' },
        { label: 'How does credit score affect mortgage rate?', seed: 'Ask Underwriting: how does credit score affect mortgage rate and terms across FHA, conventional, and VA?' },
        { label: 'What is manual underwriting — when is it required?', seed: 'Ask Underwriting: what is manual underwriting and when does a lender require it instead of AUS?' },
        { label: 'FHA at 580 vs 620 vs 640 — rate and term impact', seed: 'Ask Underwriting: how does credit score affect FHA rate and terms at 580 vs 620 vs 640?' },
    ];

    if (tp.isLimits || tp.isJumbo) return [
        { label: '2026 conforming loan limits by county type', seed: 'Ask Underwriting: what are the 2026 conventional conforming loan limits — standard, high-balance, and by state?' },
        { label: 'FHA loan limits for 2026 — floor and ceiling', seed: 'Ask Underwriting: what are the FHA loan limits for 2026 nationally and in high-cost areas?' },
        { label: 'Jumbo loan requirements — credit, DTI, reserves', seed: 'Ask Underwriting: what are the typical credit score, DTI, and reserve requirements for jumbo loans?' },
        { label: 'High-balance vs standard conforming — how do they differ?', seed: 'Ask Underwriting: what is the difference between a high-balance conforming loan and a standard conforming loan?' },
    ];

    if (tp.isReserves) return [
        { label: 'Reserve requirements by property type', seed: 'Ask Underwriting: how do reserve requirements differ for primary, second home, and investment properties?' },
        { label: 'What assets count as mortgage reserves?', seed: 'Ask Underwriting: what types of assets count as mortgage reserves in underwriting — 401k, stocks, savings?' },
        { label: 'DSCR loans — how many months reserves required?', seed: 'Ask Underwriting: compare reserve requirements for DSCR vs conventional investment loans' },
        { label: 'Multiple financed properties — reserve rules', seed: 'Ask Underwriting: what are the reserve requirements when you have multiple financed properties?' },
    ];

    if (tp.isSelfEmp) return [
        { label: 'How is self-employed income calculated for mortgage?', seed: 'Ask Underwriting: how do lenders calculate qualifying income for self-employed borrowers — 1040s, write-offs?' },
        { label: 'What documents does a self-employed borrower need?', seed: 'Ask Underwriting: what documentation is required for self-employed mortgage applicants — tax returns, P&L, bank statements?' },
        { label: 'Bank statement loans vs full-doc — when to use each?', seed: 'Ask Underwriting: how does bank statement loan underwriting work vs full-doc for self-employed borrowers?' },
        { label: 'Does business debt count against personal DTI?', seed: 'Ask Underwriting: does business debt count in DTI for a self-employed borrower on a conventional loan?' },
    ];

    if (tp.isEmploy) return [
        { label: 'New job before closing — does it disqualify me?', seed: 'Ask Underwriting: can I change jobs before closing and still qualify — what are the employment history rules?' },
        { label: 'Employment gaps — how do lenders view them?', seed: 'Ask Underwriting: how long of an employment gap requires explanation for FHA and conventional loans?' },
        { label: 'How is part-time income documented for mortgage?', seed: 'Ask Underwriting: how do lenders count part-time income for mortgage qualification?' },
        { label: 'How long must bonus/overtime income be documented?', seed: 'Ask Underwriting: how long do bonus or overtime earnings need to be documented to count in mortgage income?' },
    ];

    if (tp.isWaiting) return [
        { label: 'Waiting periods after bankruptcy — all loan types', seed: 'Ask Underwriting: what are the mortgage waiting periods after Chapter 7 and Chapter 13 bankruptcy for FHA, conventional, VA?' },
        { label: 'Waiting period after foreclosure or short sale', seed: 'Ask Underwriting: what are the waiting periods after foreclosure or short sale for FHA, conventional, VA, and USDA?' },
        { label: 'Can extenuating circumstances shorten waiting periods?', seed: 'Ask Underwriting: what counts as extenuating circumstances that shorten mortgage waiting periods after foreclosure?' },
        { label: 'Credit score recovery — what score do I need by when?', seed: 'Ask Underwriting: after bankruptcy or foreclosure, what credit score do I need and how fast can it recover?' },
    ];

    if (tp.isRefi) return [
        { label: 'Cash-out refi — how much equity can I take?', seed: 'Ask Underwriting: what are the LTV limits for cash-out refinancing on conventional, FHA, and VA loans?' },
        { label: 'Streamline refi — FHA and VA eligibility rules', seed: 'Ask Underwriting: what are the rules for FHA Streamline and VA IRRRL refinance — eligibility and requirements?' },
        { label: 'Waiting period to refi after purchase', seed: 'Ask Underwriting: how long do I have to wait before I can refinance a recently purchased home?' },
        { label: 'No-cash-out vs cash-out refi — guideline differences', seed: 'Ask Underwriting: what is the difference in underwriting requirements between a rate-term and cash-out refinance?' },
    ];

    if (tp.isClosing) return [
        { label: 'Loan Estimate vs Closing Disclosure — key differences', seed: 'Ask Underwriting: what is the difference between a Loan Estimate and Closing Disclosure under TRID?' },
        { label: 'What closing costs can be rolled into the loan?', seed: 'Ask Underwriting: which closing costs can be financed or rolled into the loan on FHA, VA, and conventional?' },
        { label: 'Seller concessions — how much can seller pay?', seed: 'Ask Underwriting: what are the seller concession limits by loan type — FHA, conventional, VA, USDA?' },
        { label: 'Can closing costs be gifted?', seed: 'Ask Underwriting: can closing costs be covered by gift funds or grants on FHA or conventional loans?' },
    ];

    if (tp.isLockRate) return [
        { label: 'Float-down option — how does it work?', seed: 'Ask Underwriting: what is a float-down rate lock option and when should I use it?' },
        { label: 'What happens if my loan doesn\'t close before lock expires?', seed: 'Ask Underwriting: what happens if my mortgage rate lock expires before closing?' },
        { label: 'Extended rate locks — cost and when to use', seed: 'Ask Underwriting: when does it make sense to pay for an extended rate lock of 60 or 90 days?' },
        { label: 'Lock after clear to close vs at application', seed: 'Ask Underwriting: when is the best time to lock my mortgage rate — at application or closer to closing?' },
    ];

    if (tp.isManualUW) return [
        { label: 'What credit score triggers manual underwriting?', seed: 'Ask Underwriting: what credit score or scenario causes a loan to require manual underwriting on FHA?' },
        { label: 'Manual UW compensating factors — full list', seed: 'Ask Underwriting: what compensating factors are recognized in FHA and conventional manual underwriting?' },
        { label: 'DU vs LP — key differences for borrowers', seed: 'Ask Underwriting: what is the difference between Fannie Mae DU and Freddie Mac LP automated underwriting systems?' },
        { label: 'Can I get approved manually after AUS denial?', seed: 'Ask Underwriting: if DU or LP issues a refer, can the loan still be manually underwritten and approved?' },
    ];

    if (tp.isDown) return [
        { label: 'Down payment minimums by loan type — complete table', seed: 'Ask Underwriting: what are the minimum down payment requirements for FHA, conventional, VA, and USDA?' },
        { label: 'Down payment assistance programs — how do they work?', seed: 'Ask Underwriting: how do down payment assistance programs work — can they be used with FHA and conventional?' },
        { label: 'LTV limits for investment properties', seed: 'Ask Underwriting: what are the LTV and down payment requirements for investment property conventional and DSCR loans?' },
        { label: 'Second home vs primary — down payment difference', seed: 'Ask Underwriting: what is the minimum down payment for a second home vs primary residence on conventional?' },
    ];

    return [
        { label: 'FHA vs conventional — full underwriting comparison', seed: 'Ask Underwriting: what are the main underwriting differences between FHA and conventional loans?' },
        { label: 'Credit score minimums by loan type', seed: 'Ask Underwriting: what are the minimum credit score requirements for FHA, conventional, VA, and USDA?' },
        { label: 'DTI limits — FHA, conventional, VA, USDA compared', seed: 'Ask Underwriting: compare DTI limits across all major loan types including compensating factors' },
        { label: 'Reserve requirements for investment properties', seed: 'Ask Underwriting: what are the reserve requirements for investment property and DSCR loans?' },
    ];
}

export function buildUWCard(input: UWCardInput): BuiltCard {
    const { question, answerMarkdown, source, sourceUrl, elapsedMs } = input;
    const chips = generateUWFollowUpChips(question);

    const tp = uwTopic(question);
    let nextStep = 'Verify current guidelines with your lender or at the official source.';
    if (tp.isFHA || tp.isMIP) nextStep = 'Confirm FHA guidelines at hud.gov or with an FHA-approved lender.';
    if (tp.isConv || tp.isPMI) nextStep = 'Confirm conventional guidelines at fanniemae.com or with your lender.';
    if (tp.isVA) nextStep = 'Verify VA entitlement and eligibility at va.gov/housing-assistance.';
    if (tp.isUSDA) nextStep = 'Check USDA property and income eligibility at rd.usda.gov.';
    if (tp.isDSCR) nextStep = 'Get DSCR quotes from: LoanDepot, Griffin Funding, JMAC, Angel Oak.';
    if (tp.isSelfEmp) nextStep = 'Work with a loan officer experienced in bank-statement or self-employed loans.';
    if (tp.isCredit) nextStep = 'Pull your full tri-merge credit report before applying — dispute errors early.';

    const sourceFooter = source && sourceUrl
        ? `\n\n---\n\n## 📎 Source\n[${source}](${sourceUrl})`
        : source
            ? `\n\n---\n\n## 📎 Source\n${source}`
            : '';

    const answer = `${answerMarkdown}${sourceFooter}`;

    return {
        answer,
        next_step: nextStep,
        follow_up: chips[0].label,
        follow_up_chips: chips,
        confidence: '1.00 (sourced from official guidelines database)',
    };
}

export function buildUWStarterCard(): BuiltCard {
    const topics = [
        { label: 'DTI limits by loan type', desc: 'FHA, conventional, VA, USDA — max ratios + compensating factors', seed: 'Ask Underwriting: what are the DTI limits for FHA, conventional, VA, and USDA loans including compensating factors?' },
        { label: 'Credit score minimums', desc: 'Minimum FICO by program — 500, 580, 620, 640', seed: 'Ask Underwriting: what are the minimum credit score requirements for FHA, conventional, VA, and USDA?' },
        { label: 'Gift fund rules', desc: 'Who allows gifts, what docs are required', seed: 'Ask Underwriting: can gift funds be used for a down payment on FHA and conventional loans — what are the rules and documentation required?' },
        { label: 'Self-employed income', desc: 'How lenders calculate qualifying income', seed: 'Ask Underwriting: how is self-employed income calculated for mortgage qualification — what documents are required?' },
        { label: 'Reserve requirements', desc: 'Months of PITIA required by loan type', seed: 'Ask Underwriting: what are the reserve requirements for conventional, FHA, and investment property loans?' },
    ];

    const rows = topics.map(t =>
        `| **${t.label}** | ${t.desc} |`
    ).join('\n');

    const answer = `## 📋 Ask Underwriting\n\nGet instant answers from agency guidelines — Fannie Mae, FHA, VA, USDA, and lender overlays.\n\n| Topic | What it covers |\n|-------|----------------|\n${rows}\n\n> Ask any underwriting question in plain English. Answers cite the exact guideline source.`;

    const follow_up_chips = topics.map(t => ({
        label: t.label,
        seed: t.seed,
    }));

    return {
        answer,
        next_step: 'Select a topic below or type your own underwriting question.',
        follow_up: follow_up_chips[0].label,
        follow_up_chips,
        confidence: '1.00 (HomeRates.ai — UW starter card)',
    };
}
