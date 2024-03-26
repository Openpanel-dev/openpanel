import { fileURLToPath } from 'url';

/** @typedef {import("prettier").Config} PrettierConfig */
/** @typedef {import("prettier-plugin-tailwindcss").PluginOptions} TailwindConfig */
/** @typedef {import("@ianvs/prettier-plugin-sort-imports").PluginConfig} SortImportsConfig */

/** @type { PrettierConfig | SortImportsConfig | TailwindConfig } */
const config = {
  plugins: [
    '@ianvs/prettier-plugin-sort-imports',
    'prettier-plugin-tailwindcss',
  ],
  tailwindConfig: fileURLToPath(
    new URL('../../apps/dashboard/tailwind.config.js', import.meta.url)
  ),
  tailwindFunctions: ['cn', 'cva'],
  importOrder: [
    '^(react/(.*)$)|^(react$)|^(react-native(.*)$)',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@openpanel/(.*)$',
    '',
    '^~/',
    '^[../]',
    '^[./]',
  ],
  importOrderParserPlugins: [
    'typescript',
    'jsx',
    'decorators-legacy',
    'importAssertions',
  ],
  importOrderTypeScriptVersion: '4.4.0',
  singleQuote: true,
  semi: true,
  trailingComma: 'es5',
  printWidth: 80,
  tabWidth: 2,
};

export default config;
