import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ForSeo {
  title: string;
  description: string;
  noindex?: boolean;
}

export interface ForHero {
  heading: string;
  subheading: string;
  badges: string[];
}

export interface ForProblem {
  title: string;
  intro: string;
  items: Array<{
    title: string;
    description: string;
  }>;
}

export interface ForFeature {
  title: string;
  description: string;
  icon?: string;
}

export interface ForFeatures {
  title: string;
  intro: string;
  items: ForFeature[];
}

export interface ForBenefit {
  title: string;
  description: string;
}

export interface ForBenefits {
  title: string;
  intro: string;
  items: ForBenefit[];
}

export interface ForFaq {
  question: string;
  answer: string;
}

export interface ForFaqs {
  title: string;
  intro: string;
  items: ForFaq[];
}

export interface ForCta {
  label: string;
  href: string;
}

export interface ForRelatedLinks {
  articles?: Array<{ title: string; url: string }>;
  guides?: Array<{ title: string; url: string }>;
  comparisons?: Array<{ title: string; url: string }>;
}

export interface ForData {
  url: string;
  slug: string;
  audience: string;
  seo: ForSeo;
  hero: ForHero;
  problem: ForProblem;
  features: ForFeatures;
  benefits: ForBenefits;
  faqs: ForFaqs;
  related_links?: ForRelatedLinks;
  ctas: {
    primary: ForCta;
    secondary: ForCta;
  };
}

const contentDir = join(process.cwd(), 'content', 'for');

export async function getForData(slug: string): Promise<ForData | null> {
  try {
    const filePath = join(contentDir, `${slug}.json`);
    const fileContents = readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContents) as ForData;
    return {
      ...data,
      url: `/for/${slug}`,
    };
  } catch (error) {
    console.error(`Error loading for data for ${slug}:`, error);
    return null;
  }
}

export async function getAllForSlugs(): Promise<string[]> {
  try {
    const files = readdirSync(contentDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''));
  } catch (error) {
    console.error('Error reading for directory:', error);
    return [];
  }
}
