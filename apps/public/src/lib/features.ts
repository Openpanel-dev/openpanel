import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isContentSlug } from './utils';

// What a feature page keeps in JSON: the parts search engines and the FAQ
// schema read. Layout, pillar copy and visuals live in the page's TSX
// composition under src/app/(content)/features/_pages.
export interface FeatureSeo {
  title: string;
  description: string;
  keywords?: string[];
}

export interface FeatureHero {
  heading: string;
  subheading: string;
}

export interface RelatedFeature {
  slug: string;
  title: string;
  description?: string;
}

export interface FeatureFaq {
  question: string;
  answer: string;
}

export interface FeatureFaqs {
  title: string;
  intro?: string;
  items: FeatureFaq[];
}

export interface FeatureCta {
  label: string;
  href: string;
}

export interface FeatureData {
  url: string;
  slug: string;
  /** Short name for nav, footer and pills (e.g. "Event tracking") */
  short_name: string;
  seo: FeatureSeo;
  hero: FeatureHero;
  related_features: RelatedFeature[];
  faqs: FeatureFaqs;
  cta: FeatureCta;
}

const contentDir = join(process.cwd(), 'content', 'features');

function readFeature(slug: string): FeatureData {
  const fileContents = readFileSync(join(contentDir, `${slug}.json`), 'utf8');
  const data = JSON.parse(fileContents) as Omit<FeatureData, 'url'>;
  return { ...data, url: `/features/${slug}` };
}

export async function getFeatureData(
  slug: string
): Promise<FeatureData | null> {
  if (!isContentSlug(slug)) {
    return null;
  }
  try {
    return readFeature(slug);
  } catch (error) {
    console.error(`Error loading feature data for ${slug}:`, error);
    return null;
  }
}

export async function getAllFeatureSlugs(): Promise<string[]> {
  try {
    return readdirSync(contentDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''));
  } catch (error) {
    console.error('Error reading features directory:', error);
    return [];
  }
}

/** Sync loader for use in source.ts (same pattern as compareSource). */
export function loadFeatureSourceSync(): FeatureData[] {
  try {
    return readdirSync(contentDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => readFeature(file.replace('.json', '')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error('Error loading feature source:', error);
    return [];
  }
}
