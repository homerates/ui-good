#!/usr/bin/env node
// tools/preflight.mjs — focused guards

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const ok = (m) => console.log(`✅ ${m}`);
const fail = (tag, m) => { console.error(`❌ ${tag}: ${m}`); process.exitCode = 1; };

// 1) IMPORT_ALIAS_MISSING
(() => {
  const ts = path.join(ROOT, "tsconfig.json");
  const js = path.join(ROOT, "jsconfig.json");
  const cfgPath = fs.existsSync(ts) ? ts : (fs.existsSync(js) ? js : null);
  let hasAlias = false;
  if (cfgPath) {
    try {
      const cfg = JSON.parse(read(cfgPath));
      const paths = cfg?.compilerOptions?.paths;
      hasAlias = !!(paths && paths["@/*"]);
    } catch {}
  }
  const routePath = path.join(ROOT, "app", "api", "calc", "payment", "route.ts");
  const usesAlias = read(routePath).includes(`from "@/`);
  if (usesAlias && !hasAlias) fail("[IMPORT_ALIAS_MISSING]", `@/* used in ${routePath} but ts/jsconfig paths missing.`);
  else ok("Alias check: OK");
})();

// 2) NAMED_EXPORT_DRIFT — only check the lib import
(() => {
  const routePath = path.join(ROOT, "app", "api", "calc", "payment", "route.ts");
  const libPath = path.join(ROOT, "lib", "calculators", "payment.ts");
  const route = read(routePath);
  const lib = read(libPath);
  if (!route || !lib) return ok("Named export drift: skipped (files not found)");

  // find the named import that points to the calculators/payment file
  const importRegex = /import\s*{\s*([^}]+)\s*}\s*from\s*["']([^"']+)["']/g;
  let m, names = null;
  while ((m = importRegex.exec(route))) {
    const from = m[2] || "";
    if (from.includes("lib/calculators/payment")) {
      names = m[1]
        .split(",")
        .map(s => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      break;
    }
  }
  if (!names) return ok("Named export drift: no lib import detected");

  const missing = names.filter(n =>
    !(new RegExp(`export\\s+(?:function|const|class)\\s+${n}\\b`).test(lib) ||
      new RegExp(`export\\s*{[^}]*\\b${n}\\b[^}]*}`).test(lib))
  );
  if (missing.length) fail("[NAMED_EXPORT_DRIFT]", `Route imports missing from lib: ${missing.join(", ")}`);
  else ok("Named export drift: OK");
})();

// 3) ESLint flat config
(() => {
  const ignore = path.join(ROOT, ".eslintignore");
  const flat = path.join(ROOT, "eslint.config.js");
  if (fs.existsSync(ignore) && !fs.existsSync(flat)) {
    fail("[ESLINT_FLAT_CONFIG_MISSING]", ".eslintignore exists but eslint.config.js is missing.");
  } else ok("ESLint flat config: OK");
})();

// 4) ROUTE_TAG_MISMATCH — ensure tag is typed as string, not literal
(() => {
  const routePath = path.join(ROOT, "app", "api", "calc", "payment", "route.ts");
  const t = read(routePath);
  if (!t) return ok("Route tag type: skipped");
  // look for `type ... tag: "something"`
  const typedLiteral = /tag\s*:\s*"(?:[^"]+)"/.test(t) && /type\s+\w+/.test(t);
  if (typedLiteral) fail("[ROUTE_TAG_MISMATCH]", "meta.tag appears typed as a literal. Use `tag: string` in the type.");
  else ok("Route tag type: OK");
})();

// 5) UI_META_UNDEFINED — ensure meta.path is set literally somewhere in the JSON body
(() => {
  const routePath = path.join(ROOT, "app", "api", "calc", "payment", "route.ts");
  const t = read(routePath);
  if (!t) return ok("API meta.path: skipped");
  const setsPath = /meta\s*:\s*{[^}]*\bpath\s*:\s*["'][^"']+["'][^}]*}/s.test(t);
  if (!setsPath) fail("[UI_META_UNDEFINED]", "Calc route does not set meta.path inline; UI may render blanks.");
  else ok("API meta.path set: OK");
})();

// 6) ENV vars (informational)
(() => {
  const ans = read(path.join(ROOT, "app", "api", "answers", "route.ts"));
  if (ans && /process\.env\./.test(ans)) {
    const found = Array.from(ans.matchAll(/process\.env\.([A-Z0-9_]+)/g)).map(m => m[1]);
    const unique = [...new Set(found)];
    console.log(`ℹ Required env (detected): ${unique.join(", ") || "(none)"}`);
  }
})();

process.exit(process.exitCode || 0);
