# Error Tag Library (HomeRates)

Purpose: a shared vocabulary + preflight checks to stop déjà-vu build breaks.

---

## [IMPORT_ALIAS_MISSING]
**Symptom:** `Module not found: Can't resolve '@/...'` on build.  
**Root:** `@/*` path alias not defined in tsconfig/jsconfig or mismatched.  
**Fix:** Use relative imports or add `"baseUrl"` + `"paths"`.

**Precheck:** Scan for `from "@/` usage; if found, verify tsconfig has the alias.

---

## [NAMED_EXPORT_DRIFT]
**Symptom:** `has no exported member 'X'` or “Attempted import error: 'X' is not exported from '…'”.  
**Root:** Route imports a symbol that lib no longer exports (e.g., `payment` vs `calculatePayment`).  
**Fix:** Re-export legacy name or update route import; keep back-compat for one release.

**Precheck:** Parse route imports → confirm lib file exports those names.

---

## [CASE_SENSITIVITY_PATH]
**Symptom:** Works locally on Windows/macOS; fails on Linux build with `Module not found`.  
**Root:** Filename or folder case mismatch (e.g., `Calculators` vs `calculators`).  
**Fix:** Normalize to lower-case paths; fix imports case-exact.

**Precheck:** Stat each import path on disk; error if case differs.

---

## [ESLINT_FLAT_CONFIG_MISSING]
**Symptom:** `(node) ESLintIgnoreWarning: .eslintignore is no longer supported`.  
**Root:** Next 15 uses flat config; `.eslintignore` deprecated.  
**Fix:** Add `eslint.config.js` with `ignores`.

**Precheck:** If `.eslintignore` exists and `eslint.config.js` missing → warn.

---

## [ROUTE_TAG_MISMATCH]
**Symptom:** UI meta shows `calc-v1` while code expects `calc-v2-piti`.  
**Root:** Hard-typed tag in route or stale meta.  
**Fix:** Route `meta.tag` must be `string`; set correct tag at runtime.

**Precheck:** Grep route for `meta.tag:` typing; ensure `string`.

---

## [UI_META_UNDEFINED]
**Symptom:** UI prints `path: | usedFRED: undefined`.  
**Root:** Old `page.tsx` not handling meta shape; calc short-circuit isn’t flattening.  
**Fix:** Rebuild UI; keep `meta.path` set in API.

**Precheck:** Ensure APIs set `meta.path` consistently.

---

## [VERCEL_CACHE_STALE]
**Symptom:** Prod shows old behavior after deploy.  
**Root:** Cached build or CDN content.  
**Fix:** `revalidate: 0` for answers; confirm `dynamic="force-dynamic"` on testing routes.

**Precheck:** Flag routes missing explicit cache policy where appropriate.

---

## [ENV_VAR_MISSING]
**Symptom:** Answers route times out / 500s.  
**Root:** Missing `OPENAI_API_KEY`, `TAVILY_API_KEY`, etc.  
**Fix:** Verify on Vercel env; guard with friendly error.

**Precheck:** Check required env names (only for routes that need them).

---
