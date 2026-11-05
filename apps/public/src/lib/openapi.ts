import path from 'node:path';
import { apiRefCollection } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import type { Document } from 'fumadocs-openapi';
import {
  createOpenAPI,
  openapiPlugin,
  openapiSource,
} from 'fumadocs-openapi/server';
import { cache } from 'react';

// The reference documents the public API, so dev reads the production spec
// unless pointed at a local API.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.openpanel.dev';

// The API serves its spec without `servers` (each install has its own URL),
// so the docs add OpenPanel Cloud's for the request examples.
async function loadSpec(): Promise<Document> {
  const response = await fetch(`${API_URL}/openapi.json`);
  if (!response.ok) {
    throw new Error(`OpenAPI spec returned ${response.status}`);
  }
  const spec = (await response.json()) as Document;
  return { ...spec, servers: [{ url: API_URL }] };
}

export const openapi = createOpenAPI({
  input: { openpanel: loadSpec },
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

  return loader({
    baseUrl: API_REFERENCE_BASE_URL,
    source: {
      files: [...staticSource.files, ...patchedOpenapiFiles],
    },
    plugins: [openapiPlugin()],
  });
});
