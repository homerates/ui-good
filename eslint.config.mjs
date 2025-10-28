// eslint.config.js (flat config for ESLint 9 + Next 15)
import next from "eslint-config-next";

export default [
  // Ignore build artifacts
  { ignores: ["**/.next/**", "**/node_modules/**", "dist/**", "build/**"] },
  // Next's recommended rules (Core Web Vitals)
  ...next(["core-web-vitals"]),
];
