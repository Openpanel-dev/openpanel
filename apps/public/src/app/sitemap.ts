import type { MetadataRoute } from 'next';
import { localizedLocales, locales } from '@/i18n/routing';
import { getAllForSlugs } from '@/lib/for';
import { url } from '@/lib/layout.shared';
import {
  getArticlePages,
  getCompareSource,
  getDocsPages,
  getFeatureSource,
  getGuidePages,
  getPagePages,
} from '@/lib/source';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = getArticlePages();
  const docs = locales.flatMap((locale) => getDocsPages(locale));
  const pages = getPagePages();
  const guides = getGuidePages();
  const comparisons = getCompareSource();
  const features = getFeatureSource();
  const forSlugs = await getAllForSlugs();
  const localizedPath = (path: string, locale: string) =>
    `/${locale}${path === '/' ? '' : path}`;
  const localizedEntries = (path: string, priority: number) =>
    localizedLocales.map((locale) => ({
      url: url(localizedPath(path, locale)),
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority,
    }));

  return [
    {
      url: url('/'),
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
    },
    {
      url: url('/docs'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...localizedEntries('/', 1),
    ...localizedEntries('/docs', 0.8),
    ...localizedEntries('/pricing', 0.8),
    ...localizedEntries('/articles', 0.5),
    ...localizedEntries('/compare', 0.5),
    ...localizedEntries('/features', 0.8),
    ...localizedEntries('/guides', 0.5),
    ...localizedEntries('/open-source', 0.7),
    ...localizedEntries('/supporter', 0.7),
    ...localizedEntries('/tools/ip-lookup', 0.5),
    ...localizedEntries('/tools/url-checker', 0.5),
    {
      url: url('/pricing'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: url('/articles'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: url('/compare'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: url('/features'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: url('/supporter'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: url('/llms.txt'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: url('/llms-full.txt'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: url('/tools/ip-lookup'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: url('/tools/url-checker'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    ...articles.map((item) => ({
      url: url(item.url),
      lastModified: item.data.date,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
    ...localizedLocales.flatMap((locale) =>
      getArticlePages(locale).map((item) => ({
        url: url(item.url),
        lastModified: item.data.date,
        changeFrequency: 'yearly' as const,
        priority: 0.5,
      })),
    ),
    ...guides.map((item) => ({
      url: url(item.url),
      lastModified: item.data.updated ?? item.data.date,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    ...localizedLocales.flatMap((locale) =>
      getGuidePages(locale).map((item) => ({
        url: url(item.url),
        lastModified: item.data.updated ?? item.data.date,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
    ),
    ...docs.map((item) => ({
      url: url(item.url),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
    ...pages.map((item) => ({
      url: url(item.url),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
    ...localizedLocales.flatMap((locale) =>
      getPagePages(locale).map((item) => ({
        url: url(item.url),
        changeFrequency: 'monthly' as const,
        priority: 0.3,
      })),
    ),
    ...comparisons.map((item) => ({
      url: url(item.url),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...localizedLocales.flatMap((locale) =>
      getCompareSource(locale).map((item) => ({
        url: url(item.url),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
    ),
    ...features.map((item) => ({
      url: url(item.url),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...localizedLocales.flatMap((locale) =>
      getFeatureSource(locale).map((item) => ({
        url: url(item.url),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
    ),
    {
      url: url('/for'),
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    ...forSlugs.map((slug) => ({
      url: url(`/for/${slug}`),
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...localizedLocales.flatMap((locale) =>
      forSlugs.map((slug) => ({
        url: url(`/${locale}/for/${slug}`),
        lastModified: new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
    ),
  ];
}
