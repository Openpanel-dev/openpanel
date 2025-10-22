import { cloudflare } from '@cloudflare/vite-plugin';
import { wrapVinxiConfigWithSentry } from '@sentry/tanstackstart-react';
import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

const plugins = [
  viteTsConfigPaths({
    projects: ['./tsconfig.json'],
  }),
  tailwindcss(),
  tanstackStart(),
  viteReact(),
];

if (process.env.NITRO) {
  plugins.unshift(
    nitroV2Plugin({
      preset: 'node-server',
      compatibilityDate: '2025-10-21',
    }),
  );
} else {
  plugins.unshift(cloudflare({ viteEnvironment: { name: 'ssr' } }));
}

const config = defineConfig({
  plugins,
});

export default wrapVinxiConfigWithSentry(config, {
  org: process.env.VITE_SENTRY_ORG,
  project: process.env.VITE_SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only print logs for uploading source maps in CI
  // Set to `true` to suppress logs
  silent: !process.env.CI,
});
