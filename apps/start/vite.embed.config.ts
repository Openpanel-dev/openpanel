import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: './src/scripts/openpanel-embed.ts',
      output: {
        format: 'iife',
        dir: 'public',
        entryFileNames: 'openpanel-embed.js',
        name: 'OpenPanelEmbed',
      },
    },
    minify: true,
    emptyOutDir: false,
  },
});
