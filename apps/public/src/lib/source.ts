import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  articleCollection,
  docsCollection,
  guideCollection,
  pageCollection,
} from 'collections/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import type { Locale } from 'next-intl';
import {
  defaultLocale,
  getLocalePrefix,
  isLocale,
  locales,
} from '@/i18n/routing';
import { getLocalizedContentUrl } from './content-locale';
import { OPENPANEL_BASE_URL } from './openpanel-brand';
import type { CompareData } from './compare';
import type { FeatureData } from './features';
import { loadFeatureSourceSync } from './features';

const docsSource = docsCollection.toFumadocsSource();

const localeToInternal = {
  en: 'en',
  'zh-CN': 'zhCN',
  'zh-TW': 'zhTW',
} as const satisfies Record<Locale, string>;

const internalToLocale = Object.fromEntries(
  Object.entries(localeToInternal).map(([locale, internal]) => [
    internal,
    locale,
  ]),
) as Record<string, Locale>;

const internalLocales = locales.map((locale) => localeToInternal[locale]);
const defaultInternalLocale = localeToInternal[defaultLocale];

function toInternalDocsLocale(locale: Locale) {
  return localeToInternal[locale];
}

function fromInternalDocsLocale(locale: string): Locale {
  return internalToLocale[locale] ?? defaultLocale;
}

for (const file of docsSource.files) {
  for (const locale of locales) {
    const internalLocale = toInternalDocsLocale(locale);
    const localizedDocsPath = `${locale}/docs`;

    if (
      file.path === localizedDocsPath ||
      file.path.startsWith(`${localizedDocsPath}/`)
    ) {
      file.path = file.path.replace(localizedDocsPath, internalLocale);
    }
  }
}

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docsSource,
  i18n: {
    defaultLanguage: defaultInternalLocale,
    languages: internalLocales,
    parser: 'dir',
    hideLocale: 'default-locale',
  },
  url: (slugs, internalLocale) => {
    const locale = fromInternalDocsLocale(internalLocale ?? '');
    return `/${[...getLocalePrefix(locale), 'docs', ...slugs]
      .filter(Boolean)
      .join('/')}`;
  },
  plugins: [lucideIconsPlugin()],
});

const articleCollectionSource = toFumadocsSource(articleCollection, []);
const pageCollectionSource = toFumadocsSource(pageCollection, []);
const guideCollectionSource = toFumadocsSource(guideCollection, []);

export const articleSource = loader({
  baseUrl: '/articles',
  source: articleCollectionSource,
  plugins: [lucideIconsPlugin()],
});

export const pageSource = loader({
  baseUrl: '/',
  source: pageCollectionSource,
});

export const guideSource = loader({
  baseUrl: '/guides',
  source: guideCollectionSource,
  plugins: [lucideIconsPlugin()],
});

const localizedArticleSources = createLocalizedSource(articleSource, 'articles');
const localizedPageSources = createLocalizedSource(pageSource, '');
const localizedGuideSources = createLocalizedSource(guideSource, 'guides');

type ContentSource = {
  getPages: () => Array<{
    slugs: string[];
    url: string;
  }>;
  getPage: (slugs: string[]) => unknown;
};

function createLocalizedSource<TSource extends ContentSource>(
  source: TSource,
  basePath: string,
) {
  const pages = source.getPages();

  return Object.fromEntries(
    locales.map((locale) => {
      const localizedPages = pages
        .filter((page) => {
          if (basePath) {
            return page.slugs[0] === locale && page.slugs[1] === basePath;
          }

          return page.slugs[0] === locale && page.slugs.length === 2;
        })
        .map((page) => {
          const contentSlugs = basePath ? page.slugs.slice(2) : page.slugs.slice(1);

          return {
            ...page,
            slugs: contentSlugs,
            url: getLocalizedContentUrl(
              `/${[basePath, ...contentSlugs].filter(Boolean).join('/')}`,
              locale,
            ),
          };
        });

      return [
        locale,
        {
          getPages: () => localizedPages,
          getPage: (slugs: string[]) =>
            localizedPages.find(
              (page) =>
                page.slugs.length === slugs.length &&
                page.slugs.every((slug, index) => slug === slugs[index]),
            ),
        },
      ];
    }),
  ) as Record<
    Locale,
    {
      getPages: () => ReturnType<TSource['getPages']>;
      getPage: TSource['getPage'];
    }
  >;
}

export function getArticlePages(locale: Locale = defaultLocale) {
  return localizedArticleSources[locale].getPages();
}

export function getArticlePage(
  slug: string[],
  locale: Locale = defaultLocale,
) {
  return localizedArticleSources[locale].getPage(slug);
}

export function getPagePages(locale: Locale = defaultLocale) {
  return localizedPageSources[locale].getPages();
}

export function getContentPage(
  slug: string[],
  locale: Locale = defaultLocale,
) {
  return localizedPageSources[locale].getPage(slug);
}

export function getGuidePages(locale: Locale = defaultLocale) {
  return localizedGuideSources[locale].getPages();
}

export function getGuidePage(
  slug: string[],
  locale: Locale = defaultLocale,
) {
  return localizedGuideSources[locale].getPage(slug);
}

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `/og/docs/${segments.join('/')}`,
  };
}

export function getDocsPage(slug: string[] = [], locale: Locale = 'en') {
  return source.getPage(slug, toInternalDocsLocale(locale));
}

export function getDocsUrl(slugs: string[] = [], locale: Locale = 'en') {
  return [...getLocalePrefix(locale), 'docs', ...slugs]
    .filter(Boolean)
    .join('/');
}

export function getDocsPages(locale?: Locale) {
  if (!locale) {
    return source.getPages();
  }

  return source.getPages(toInternalDocsLocale(locale));
}

export function getDocsPageTree(locale: Locale = 'en') {
  return source.getPageTree(toInternalDocsLocale(locale));
}

export function parseDocsPath(slug: string[] = []): {
  locale: Locale;
  internalLocale: string;
  slugs: string[];
} {
  const [first, ...rest] = slug;
  const locale = isLocale(first) ? first : defaultLocale;

  return {
    locale,
    internalLocale: toInternalDocsLocale(locale),
    slugs: locale === defaultLocale ? slug : rest,
  };
}

export function parseDocsUrlSegments(segments: string[] = []): {
  locale: Locale;
  slugs: string[];
} | null {
  const [first, second, ...rest] = segments;

  if (first === 'docs') {
    return {
      locale: defaultLocale,
      slugs: segments.slice(1),
    };
  }

  if (isLocale(first) && second === 'docs') {
    return {
      locale: first,
      slugs: rest,
    };
  }

  return null;
}

export function generateDocsParams() {
  return source.generateParams().map((params) => {
    const locale = fromInternalDocsLocale(params.lang);
    return {
      locale,
      slug: params.slug,
    };
  });
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');
  const canonical = `${OPENPANEL_BASE_URL}${page.url}`;

  return `---
## ${page.data.title}
URL: ${canonical}

${processed}`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentDir = path.join(__dirname, '../../content');

function loadCompareSource(locale: Locale = defaultLocale): CompareData[] {
  const localizedContentDir = path.join(contentDir, locale, 'compare');

  try {
    // Check if directory exists before trying to read it
    if (!fs.existsSync(localizedContentDir)) {
      return [];
    }

    const files = fs
      .readdirSync(localizedContentDir)
      .filter((file) => file.endsWith('.json'));

    return files
      .map((file) => {
        const filePath = path.join(localizedContentDir, file);
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
        url: getLocalizedContentUrl(`/compare/${item.slug}`, locale),
      }));
  } catch (error) {
    console.error('Error loading compare source:', error);
    return [];
  }
}

export const compareSource: CompareData[] = loadCompareSource();

export const featureSource: FeatureData[] = loadFeatureSourceSync();

export function getCompareSource(locale: Locale = defaultLocale) {
  return loadCompareSource(locale);
}

export function getFeatureSource(locale: Locale = defaultLocale) {
  return loadFeatureSourceSync(locale);
}
