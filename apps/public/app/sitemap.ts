import { articleSource, source } from '@/lib/source';
import type { MetadataRoute } from 'next';
import { url } from './layout.config';
const articles = await articleSource.getPages();
const docs = await source.getPages();

export default function sitemap(): MetadataRoute.Sitemap {
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
      url: url('/articles'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    ...articles.map((item) => ({
      url: url(item.url),
      lastModified: item.data.lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
    ...docs.map((item) => ({
      url: url(item.url),
      lastModified: item.data.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ];
}
