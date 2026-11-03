import {
  defineCollections,
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import { z } from 'zod';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// `z.coerce.date()` turns a `date: null` frontmatter line into the epoch and
// a quoted "12" into a year; only a parsed YAML date or an ISO day may reach
// the coercion.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const zFrontmatterDate = z
  .union([z.date(), z.string().regex(ISO_DAY)])
  .pipe(z.coerce.date());

const zArticle = z.object({
  title: z.string().min(1),
  description: z.string(),
  tag: z.string().optional(),
  team: z.string().optional(),
  date: zFrontmatterDate,
  cover: z.string().default('/content/cover-default.jpg'),
  updated: zFrontmatterDate.optional(),
});
const zPage = z.object({
  title: z.string().min(1),
  description: z.string(),
  noindex: z.boolean().optional(),
});

const zGuide = z.object({
  title: z.string().min(1),
  description: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  timeToComplete: z.number(), // minutes
  date: zFrontmatterDate,
  updated: zFrontmatterDate.optional(),
  cover: z.string().default('/content/cover-default.jpg'),
  team: z.string().optional(),
  steps: z.array(
    z.object({
      name: z.string(),
      anchor: z.string(),
    })
  ),
});

export const articleCollection = defineCollections({
  type: 'doc',
  dir: './content/articles',
  schema: zArticle,
});

export const articleMeta = defineCollections({
  type: 'meta',
  dir: './content/articles',
  schema: zArticle,
});

export const pageCollection = defineCollections({
  type: 'doc',
  dir: './content/pages',
  schema: zPage,
});

export const pageMeta = defineCollections({
  type: 'meta',
  dir: './content/pages',
  schema: zPage,
});

export const guideCollection = defineCollections({
  type: 'doc',
  dir: './content/guides',
  schema: zGuide,
});

export const guideMeta = defineCollections({
  type: 'meta',
  dir: './content/guides',
  schema: zGuide,
});

export const apiRefCollection = defineCollections({
  type: 'doc',
  dir: './content/docs/api-reference',
  schema: frontmatterSchema,
});

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});
