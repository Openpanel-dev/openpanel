import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface FeatureSeo {
  title: string;
  description: string;
  keywords?: string[];
}

export interface FeatureHero {
  heading: string;
  subheading: string;
  badges: string[];
}

export interface FeatureDefinition {
  title?: string;
  text: string;
}

export interface FeatureCapability {
  title: string;
  description: string;
  icon?: string;
}

export interface FeatureCapabilitiesSection {
  title: string;
  intro?: string;
}

export interface FeatureScreenshot {
  src?: string;
  srcDark?: string;
  srcLight?: string;
  alt: string;
  caption?: string;
}

export interface FeatureHowItWorksStep {
  title: string;
  description: string;
}

export interface FeatureHowItWorks {
  title: string;
  intro?: string;
  steps: FeatureHowItWorksStep[];
}

export interface FeatureUseCase {
  title: string;
  description: string;
  icon?: string;
}

export interface FeatureUseCases {
  title: string;
  intro?: string;
  items: FeatureUseCase[];
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
  /** Short internal name for nav, footer, etc. (e.g. "Event tracking") */
  short_name: string;
  seo: FeatureSeo;
  hero: FeatureHero;
  definition: FeatureDefinition;
  capabilities: FeatureCapability[];
  capabilities_section?: FeatureCapabilitiesSection;
  screenshots: FeatureScreenshot[];
  how_it_works?: FeatureHowItWorks;
  use_cases: FeatureUseCases;
  related_features: RelatedFeature[];
  faqs: FeatureFaqs;
  cta: FeatureCta;
}

const contentDir = join(process.cwd(), 'content', 'features');

export async function getFeatureData(
  slug: string,
): Promise<FeatureData | null> {
  try {
    const filePath = join(contentDir, `${slug}.json`);
    const fileContents = readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContents) as Omit<FeatureData, 'url'>;
    return {
      ...data,
      url: `/features/${slug}`,
    };
  } catch (error) {
    console.error(`Error loading feature data for ${slug}:`, error);
    return null;
  }
}

export async function getAllFeatureSlugs(): Promise<string[]> {
  try {
    const files = readdirSync(contentDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''));
  } catch (error) {
    console.error('Error reading features directory:', error);
    return [];
  }
}

export async function loadFeatureSource(): Promise<FeatureData[]> {
  const slugs = await getAllFeatureSlugs();
  const results: FeatureData[] = [];
  for (const slug of slugs) {
    const data = await getFeatureData(slug);
    if (data) results.push(data);
  }
  return results;
}

/** Sync loader for use in source.ts (same pattern as compareSource). */
export function loadFeatureSourceSync(): FeatureData[] {
  try {
    const files = readdirSync(contentDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const slug = file.replace('.json', '');
        const filePath = join(contentDir, file);
        const fileContents = readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContents) as Omit<FeatureData, 'url'>;
        return { ...data, url: `/features/${slug}` };
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    console.error('Error loading feature source:', error);
    return [];
  }
}
