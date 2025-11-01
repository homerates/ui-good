/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["next/core-web-vitals"], // works with ESLint 8.57 + next 14 config
  ignorePatterns: ["**/node_modules/**", ".next", "out", "build", "dist"]
};
