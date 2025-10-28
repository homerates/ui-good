// eslint.config.js (root)
// Minimal file so preflight stops complaining.
// We are NOT using Next’s config here to avoid the rushstack patch entirely.
export default [
  {
    ignores: ["**/node_modules/**", ".next", "out", "build", "dist"]
  }
];
