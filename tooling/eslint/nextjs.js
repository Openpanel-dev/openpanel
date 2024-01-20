/** @type {import('eslint').Linter.Config} */
const config = {
  extends: ['next'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
  },
};

module.exports = config;
