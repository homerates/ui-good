/* ========== START: scripts/knowledge-cli.mjs ========== */
import fs from "fs";
import path from "path";

function loadJSON(p) {
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf8"));
}
function saveJSON(p, obj) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

const paths = {
    taxes: "data/knowledge/taxes/countyTaxCA.json",
    limits: "data/knowledge/limits/loanLimitsCA.json",
    products: "data/knowledge/products/registry.json",
    acronyms: "data/knowledge/acronyms.json",
};

function addCountyTax(county, rateStr) {
    const p = paths.taxes, j = loadJSON(p);
    j.countyTaxRates ||= [];
    const rate = Number(rateStr);
    if (Number.isNaN(rate)) throw new Error("Rate must be numeric (e.g., 0.012 for 1.2%)");
    const idx = j.countyTaxRates.findIndex(r => r.county.toLowerCase() === county.toLowerCase());
    if (idx >= 0) j.countyTaxRates[idx].rate = rate; else j.countyTaxRates.push({ county, rate });
    saveJSON(p, j);
}

function mapZip(zip, county) {
    const p = paths.taxes, j = loadJSON(p);
    j.zipToCounty ||= {};
    j.zipToCounty[String(zip)] = county;
    saveJSON(p, j);
}

function addLoanLimit(county, one, two, three, four) {
    const p = paths.limits, j = loadJSON(p);
    j.conformingLoanLimits ||= [];
    const row = {
        county,
        oneUnit: Number(one), twoUnit: Number(two), threeUnit: Number(three), fourUnit: Number(four)
    };
    const idx = j.conformingLoanLimits.findIndex(r => r.county.toLowerCase() === county.toLowerCase());
    if (idx >= 0) j.conformingLoanLimits[idx] = row; else j.conformingLoanLimits.push(row);
    saveJSON(p, j);
}

function addProduct(id, label, summary) {
    const p = paths.products, j = loadJSON(p);
    j.registry ||= [];
    const idx = j.registry.findIndex(r => r.id === id);
    const block = { id, label, summary, notes: [], eligibilityKeys: [] };
    if (idx >= 0) j.registry[idx] = { ...j.registry[idx], ...block };
    else j.registry.push(block);
    saveJSON(p, j);
}

function addAcronym(key, meaning, context = "") {
    const p = paths.acronyms, j = loadJSON(p);
    j.acronyms ||= [];
    const idx = j.acronyms.findIndex(a => a.key.toLowerCase() === key.toLowerCase());
    const row = context ? { key, meaning, context } : { key, meaning };
    if (idx >= 0) j.acronyms[idx] = row; else j.acronyms.push(row);
    saveJSON(p, j);
}

function list(kind) {
    const p = paths[kind];
    if (!p) throw new Error("Unknown dataset. Use taxes | limits | products | acronyms");
    console.log(JSON.stringify(loadJSON(p), null, 2));
}

function help() {
    console.log(`Usage:
  node scripts/knowledge-cli.mjs add-county-tax "Los Angeles" 0.012
  node scripts/knowledge-cli.mjs map-zip 90011 "Los Angeles"
  node scripts/knowledge-cli.mjs add-loan-limit "Los Angeles" 1150000 1473000 1780000 2215000
  node scripts/knowledge-cli.mjs add-product DSCR "Advantage FLEX DSCR" "Cash-flow based investor qualification"
  node scripts/knowledge-cli.mjs add-acronym DSCR "Debt Service Coverage Ratio" "Investment qualification via rents vs PITIA"
  node scripts/knowledge-cli.mjs list taxes|limits|products|acronyms
`);
}

const [, , cmd, ...args] = process.argv;
try {
    switch (cmd) {
        case "add-county-tax": addCountyTax(args[0], args[1]); break;
        case "map-zip": mapZip(args[0], args[1]); break;
        case "add-loan-limit": addLoanLimit(args[0], args[1], args[2], args[3], args[4]); break;
        case "add-product": addProduct(args[0], args[1], args.slice(2).join(" ")); break;
        case "add-acronym": addAcronym(args[0], args[1], args.slice(2).join(" ")); break;
        case "list": list(args[0]); break;
        default: help(); process.exit(1);
    }
    console.log("OK");
} catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
}
/* ========== END: scripts/knowledge-cli.mjs ========== */
