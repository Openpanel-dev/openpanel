import { url } from '@/lib/layout.shared';
import { articleSource, compareSource, pageSource, source } from '@/lib/source';
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await articleSource.getPages();
  const docs = await source.getPages();
  const pages = await pageSource.getPages();
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
      url: url('/supporter'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...articles.map((item) => ({
      url: url(item.url),
      lastModified: item.data.date,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
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
    ...compareSource.map((item) => ({
      url: url(item.url),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
