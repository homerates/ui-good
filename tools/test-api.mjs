// tools/test-api.mjs
// Minimal API sanity tests (no deps). Hits production endpoint.

const BASE = process.env.HR_BASE || "https://chat.homerates.ai";
const EP = `${BASE}/api/calc/answer`;

const cases = [
    // Canon 1: price + down + rate + term + zip
    {
        name: "price/down/rate/term/zip",
        q: "price 900k down 20 percent 6.25 30 years zip 92688",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 720000 &&
            j.inputs.termMonths === 360 &&
            j.inputs.ratePct === 6.25 &&
            j.breakdown &&
            j.breakdown.monthlyPI > 0,
    },

    // Canon 2: loan @ rate, term with attached years, reverse extras
    {
        name: "loan @ rate + 30yr + reverse extras",
        q: "620k @ 6.25 30yr piti with 125 ins and 125 hoa",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 620000 &&
            j.inputs.ratePct === 6.25 &&
            j.inputs.termMonths === 360 &&
            j.inputs.monthlyIns === 125 &&
            j.inputs.monthlyHOA === 125 &&
            j.breakdown &&
            j.breakdown.monthlyPI > 0,
    },

    // Canon 3: large loan
    {
        name: "large loan 30 years",
        q: "loan 1,015,000 at 7 percent for 30 years",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 1015000 &&
            j.inputs.ratePct === 7 &&
            j.inputs.termMonths === 360 &&
            j.breakdown &&
            j.breakdown.monthlyPI > 0,
    },

    // Extra coverage
    {
        name: "percent sign variant",
        q: "price 750k down 20% 6.5 30 years 91301",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 600000 &&
            j.inputs.termMonths === 360 &&
            j.inputs.ratePct === 6.5,
    },
    {
        name: "30y alias",
        q: "loan 480k at 6.5 30y",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 480000 &&
            j.inputs.termMonths === 360,
    },
    {
        name: "360mo alias",
        q: "loan 400k @ 6.25 360mo",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 400000 &&
            j.inputs.termMonths === 360,
    },
    {
        name: "ins/hoa forward order",
        q: "loan 400k @ 6.25 30 years ins 125 hoa 125",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.monthlyIns === 125 &&
            j.inputs.monthlyHOA === 125,
    },
    {
        name: "k/m suffix on price",
        q: "price 1.2m down 25% 6.75 30 years zip 91301",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 900000 &&
            j.inputs.ratePct === 6.75 &&
            j.inputs.termMonths === 360,
    },
    {
        name: "no zip provided",
        q: "price 680k down 10% 6.375 30 years",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 612000 &&
            j.inputs.termMonths === 360,
    },
    {
        name: "rate via % after number (not down%)",
        q: "loan 550k 6.125% 30 years",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 550000 &&
            j.inputs.ratePct === 6.125 &&
            j.inputs.termMonths === 360,
    },
    {
        name: "down% before word",
        q: "20 percent down price 900k 6.25 30 years 92688",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 720000 &&
            j.inputs.ratePct === 6.25 &&
            j.inputs.termMonths === 360,
    },
    {
        name: "spaces + commas tolerance",
        q: "loan 1,000,000 @ 7 30yr",
        expect: (j) =>
            j.ok === true &&
            j.inputs &&
            j.inputs.loanAmount === 1000000 &&
            j.inputs.termMonths === 360,
    },
];

async function hit(q) {
    const url = `${EP}?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "cache-control": "no-store" } });
    const j = await res.json().catch(() => ({}));
    return { status: res.status, json: j, url };
}

(async () => {
    let failed = 0;
    for (const c of cases) {
        const { status, json, url } = await hit(c.q);
        const pass = status === 200 && c.expect(json);
        if (!pass) {
            failed++;
            console.error(`✗ ${c.name}\n  URL: ${url}\n  STATUS: ${status}\n  BODY: ${JSON.stringify(json)}`);
        } else {
            console.log(`✓ ${c.name}`);
        }
    }
    if (failed) {
        console.error(`\n${failed} test(s) failed.`);
        process.exit(1);
    }
    console.log(`\nAll ${cases.length} tests passed.`);
})();
