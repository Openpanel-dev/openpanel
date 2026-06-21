import path from 'node:path';
import { apiRefCollection } from 'collections/server';
import type { Root } from 'fumadocs-core/page-tree';
import { loader } from 'fumadocs-core/source';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import {
  createOpenAPI,
  openapiPlugin,
  openapiSource,
} from 'fumadocs-openapi/server';
import { cache } from 'react';
import {
  type AppLocale,
  defaultLocale,
  getLocalizedPath,
} from '@/i18n/routing';

const API_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.openpanel.dev'
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333');

export const openapi = createOpenAPI({
  input: [`${API_URL}/documentation/json`],
});

export const API_REFERENCE_BASE_URL = '/docs/api-reference';

export const getApiReferenceSource = cache(
  async (locale: AppLocale = defaultLocale) => {
    const openapiFiles = await openapiSource(openapi, {
      groupBy: 'tag',
      meta: { folderStyle: 'separator' },
    }).catch(() => ({ files: [] as never[] }));

    const staticSource = toFumadocsSource(apiRefCollection, []);
    const localizedPrefix = `${locale}/docs/api-reference/`;
    const fallbackPrefix = `${defaultLocale}/docs/api-reference/`;
    const localizedFiles = staticSource.files.filter((f) =>
      f.path.startsWith(localizedPrefix)
    );
    const staticFiles = (
      localizedFiles.length > 0
        ? localizedFiles
        : staticSource.files.filter((f) => f.path.startsWith(fallbackPrefix))
    ).map((f) => ({
      ...f,
      path: f.path.replace(
        localizedFiles.length > 0 ? localizedPrefix : fallbackPrefix,
        ''
      ),
    }));

    const staticSlugs = staticFiles
      .filter((f): f is typeof f & { type: 'page' } => f.type === 'page')
      .map((f) => path.basename(f.path, path.extname(f.path)));

    const patchedOpenapiFiles = openapiFiles.files.map((f) => {
      if (
        f.type === 'meta' &&
        (f.path === 'meta.json' || f.path === '/meta.json')
      ) {
        const data = f.data as { pages?: string[] };
        return {
          ...f,
          data: {
            ...data,
            pages: [...staticSlugs, ...(data.pages ?? [])],
          },
        };
      }
      return f;
    });

    const source = loader({
      baseUrl: API_REFERENCE_BASE_URL,
      source: {
        files: [...staticFiles, ...patchedOpenapiFiles],
      },
      plugins: [openapiPlugin()],
    });

    return {
      ...source,
      pageTree: localizePageTreeUrls(source.pageTree, locale),
    };
  }
);

function localizePageTreeUrls(tree: Root, locale: AppLocale): Root {
  if (locale === defaultLocale) {
    return tree;
  }

  return rewriteNodeUrls(tree, locale) as Root;
}

function rewriteNodeUrls<T>(node: T, locale: AppLocale): T {
  if (!node || typeof node !== 'object') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((child) => rewriteNodeUrls(child, locale)) as T;
  }

  const record = node as Record<string, unknown>;
  const next: Record<string, unknown> = { ...record };

  if (
    typeof next.url === 'string' &&
    next.url.startsWith(API_REFERENCE_BASE_URL)
  ) {
    next.url = getLocalizedPath(next.url, locale);
  }

  if (Array.isArray(next.children)) {
    next.children = next.children.map((child) =>
      rewriteNodeUrls(child, locale)
    );
  }

  return next as T;
}
