import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CompareSeo {
  title: string;
  description: string;
  noindex?: boolean;
}

export interface CompareCta {
  label: string;
  href: string;
}

export interface CompareHero {
  heading: string;
  subheading: string;
  badges: string[];
}

export interface CompareCompetitor {
  name: string;
  logo: string;
  url: string;
  short_description: string;
  founded?: number;
  headquarters?: string;
}

export interface CompareSummary {
  title: string;
  intro: string;
  one_liner: string;
  best_for_openpanel: string[];
  best_for_competitor: string[];
}

export interface CompareHighlight {
  label: string;
  openpanel: string;
  competitor: string;
}

export interface CompareHighlights {
  title: string;
  intro: string;
  items: CompareHighlight[];
}

export interface CompareFeature {
  name: string;
  openpanel: boolean | string;
  competitor: boolean | string;
  notes?: string | null;
}

export interface CompareFeatureGroup {
  group: string;
  features: CompareFeature[];
}

export interface CompareFeatureComparison {
  title: string;
  intro: string;
  groups: CompareFeatureGroup[];
}

export interface ComparePricing {
  title: string;
  intro: string;
  openpanel: {
    model: string;
    description: string;
  };
  competitor: {
    model: string;
    description: string;
    free_tier?: string;
    pricing_url?: string;
  };
}

export interface CompareTrust {
  data_processing: string;
  data_location: string;
  self_hosting: boolean;
}

export interface CompareTrustCompliance {
  title: string;
  intro: string;
  openpanel: CompareTrust;
  competitor: CompareTrust;
}

export interface CompareUseCase {
  title: string;
  description: string;
  icon?: string;
}

export interface CompareUseCases {
  title: string;
  intro: string;
  items: CompareUseCase[];
}

export interface CompareFaq {
  question: string;
  answer: string;
}

export interface CompareFaqs {
  title: string;
  intro: string;
  items: CompareFaq[];
}

export interface CompareBenefitsSection {
  label?: string;
  title: string;
  description: string;
  cta?: CompareCta;
  benefits: string[];
}

export interface CompareTechnicalItem {
  label: string;
  openpanel: string | string[];
  competitor: string | string[];
  notes?: string | null;
}

export interface CompareTechnicalComparison {
  title: string;
  intro: string;
  items: CompareTechnicalItem[];
}

export interface CompareMigrationStep {
  title: string;
  description: string;
}

export interface CompareMigration {
  title: string;
  intro: string;
  difficulty: string;
  estimated_time: string;
  steps: CompareMigrationStep[];
  sdk_compatibility: {
    similar_api: boolean;
    notes: string;
  };
  historical_data: {
    can_import: boolean;
    notes: string;
  };
}

export interface RelatedLink {
  title?: string;
  name?: string;
  url: string;
}

export interface RelatedLinks {
  articles?: RelatedLink[];
  alternatives?: RelatedLink[];
}

export interface CompareOverview {
  title: string;
  paragraphs: string[];
}

export interface CompareData {
  url: string;
  slug: string;
  page_type: 'alternative' | 'vs';
  seo: CompareSeo;
  hero: CompareHero;
  competitor: CompareCompetitor;
  overview?: CompareOverview;
  summary_comparison: CompareSummary;
  highlights: CompareHighlights;
  feature_comparison: CompareFeatureComparison;
  technical_comparison?: CompareTechnicalComparison;
  pricing: ComparePricing;
  migration?: CompareMigration;
  trust_and_compliance?: CompareTrustCompliance;
  use_cases: CompareUseCases;
  faqs: CompareFaqs;
  benefits_section?: CompareBenefitsSection;
  related_links?: RelatedLinks;
  ctas: {
    primary: CompareCta;
    secondary: CompareCta;
  };
}

const contentDir = join(process.cwd(), 'content', 'compare');

export async function getCompareData(
  slug: string,
): Promise<CompareData | null> {
  try {
    const filePath = join(contentDir, `${slug}.json`);
    const fileContents = readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContents) as CompareData;
    return {
      ...data,
      url: `/compare/${slug}`,
    };
  } catch (error) {
    console.error(`Error loading compare data for ${slug}:`, error);
    return null;
  }
}

export async function getAllCompareSlugs(): Promise<string[]> {
  try {
    const files = readdirSync(contentDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''));
  } catch (error) {
    console.error('Error reading compare directory:', error);
    return [];
  }
}
