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

const zArticle = z.object({
  title: z.string().min(1),
  description: z.string(),
  tag: z.string().optional(),
  team: z.string().optional(),
  date: z.date(),
  cover: z.string().default('/content/cover-default.jpg'),
  updated: z.date().optional(),
});
const zPage = z.object({
  title: z.string().min(1),
  description: z.string(),
});

const zGuide = z.object({
  title: z.string().min(1),
  description: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  timeToComplete: z.number(), // minutes
  date: z.date(),
  updated: z.date().optional(),
  cover: z.string().default('/content/cover-default.jpg'),
  team: z.string().optional(),
  steps: z.array(
    z.object({
      name: z.string(),
      anchor: z.string(),
    }),
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

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});
