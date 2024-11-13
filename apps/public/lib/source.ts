import {
  articleCollection,
  articleMeta,
  docs,
  meta,
  pageCollection,
  pageMeta,
} from '@/.source';
import { loader } from 'fumadocs-core/source';
import { createMDXSource } from 'fumadocs-mdx';

export const source = loader({
  baseUrl: '/docs',
  source: createMDXSource(docs, meta),
});

export const articleSource = loader({
  baseUrl: '/articles',
  source: createMDXSource(articleCollection, articleMeta),
});

export const pageSource = loader({
  baseUrl: '/',
  source: createMDXSource(pageCollection, pageMeta),
});
