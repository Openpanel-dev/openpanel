import { loader } from 'fumadocs-core/source';
import {
  createOpenAPI,
  openapiPlugin,
  openapiSource,
} from 'fumadocs-openapi/server';
import { apiRefCollection } from 'collections/server';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import path from 'node:path';
import { cache } from 'react';

const API_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.openpanel.dev'
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333');

export const openapi = createOpenAPI({
  input: [`${API_URL}/documentation/json`],
});

export const API_REFERENCE_BASE_URL = '/docs/api-reference';

export const getApiReferenceSource = cache(async () => {
  const openapiFiles = await openapiSource(openapi, {
    groupBy: 'tag',
    meta: { folderStyle: 'separator' },
  }).catch(() => ({ files: [] as never[] }));

  const staticSource = toFumadocsSource(apiRefCollection, []);

  // Collect the slugs of static pages so we can inject them into the
  // OpenAPI-generated root meta.json (which only lists the tag groups).
  const staticSlugs = staticSource.files
    .filter((f): f is typeof f & { type: 'page' } => f.type === 'page')
    .map((f) => path.basename(f.path, path.extname(f.path)));

  // Inject static page slugs at the top of the root meta.json that
  // openapiSource generates for the tag separator groups.
  const patchedOpenapiFiles = openapiFiles.files.map((f) => {
    if (f.type === 'meta' && (f.path === 'meta.json' || f.path === '/meta.json')) {
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

  return loader({
    baseUrl: API_REFERENCE_BASE_URL,
    source: {
      files: [...staticSource.files, ...patchedOpenapiFiles],
    },
    plugins: [openapiPlugin()],
  });
});
