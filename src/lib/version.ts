// src/lib/version.ts
// Works because tsconfig has "resolveJsonModule": true
import pkg from "../../package.json" assert { type: "json" };

export const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || pkg.version || "dev";
export const COMMIT = process.env.NEXT_PUBLIC_GIT_SHA || "local";
