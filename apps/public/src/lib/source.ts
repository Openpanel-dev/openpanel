import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  articleCollection,
  docs,
  pageCollection,
} from 'fumadocs-mdx:collections/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import type { CompareData } from './compare';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const articleSource = loader({
  baseUrl: '/articles',
  source: toFumadocsSource(articleCollection, []),
  plugins: [lucideIconsPlugin()],
});

export const pageSource = loader({
  baseUrl: '/',
  source: toFumadocsSource(pageCollection, []),
});

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `/og/docs/${segments.join('/')}`,
  };
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title}

${processed}`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentDir = path.join(__dirname, '../../content/compare');

const files = fs
  .readdirSync(contentDir)
  .filter((file) => file.endsWith('.json'));

export const compareSource: CompareData[] = files
  .map((file) => {
    const filePath = path.join(contentDir, file);
    const fileContents = fs.readFileSync(filePath, 'utf8');
    try {
      return JSON.parse(fileContents) as CompareData;
    } catch (error) {
      console.error(`Error parsing compare data for ${file}:`, error);
      return null;
    }
  })
  .flatMap((item) => (item ? [item] : []))
  .map((item) => ({
    ...item,
    url: `/compare/${item.slug}`,
  }));
