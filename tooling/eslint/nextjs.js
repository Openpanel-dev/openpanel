/** @type {import('eslint').Linter.Config} */
const config = {
  extends: ['next'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
    '@next/next/no-img-element': 'off',
  },
};

module.exports = config;
