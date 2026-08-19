/**
 * What runs on the files you actually staged, before the commit lands.
 *
 * Formatting and linting are scoped to staged files so the hook stays fast.
 * Typechecking is not here: tsc has to see the whole program to be correct, so
 * it runs once from the hook itself rather than per file.
 */
const config = {
  "*.{ts,tsx,mts,cts}": ["prettier --write", "eslint --fix"],
  // --ignore-unknown keeps prettier quiet about paths it is configured to skip,
  // such as docs/, which /scope and /architect own.
  "*.{js,mjs,cjs,json,css,md,yml,yaml}": ["prettier --write --ignore-unknown"],
};

export default config;
