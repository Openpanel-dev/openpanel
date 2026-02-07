import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  articleCollection,
  docs,
  guideCollection,
  pageCollection,
} from 'fumadocs-mdx:collections/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import type { CompareData } from './compare';
import type { FeatureData } from './features';
import { loadFeatureSourceSync } from './features';

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

export const guideSource = loader({
  baseUrl: '/guides',
  source: toFumadocsSource(guideCollection, []),
  plugins: [lucideIconsPlugin()],
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

function loadCompareSource(): CompareData[] {
  try {
    // Check if directory exists before trying to read it
    if (!fs.existsSync(contentDir)) {
      return [];
    }

    const files = fs
      .readdirSync(contentDir)
      .filter((file) => file.endsWith('.json'));

    return files
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
  } catch (error) {
    console.error('Error loading compare source:', error);
    return [];
  }
}

export const compareSource: CompareData[] = loadCompareSource();

export const featureSource: FeatureData[] = loadFeatureSourceSync();
