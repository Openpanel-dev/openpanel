import {
  defineCollections,
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from 'fumadocs-mdx/config';
import { z } from 'zod';

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

export const docsCollection = defineDocs({
  dir: './content',
  docs: {
    files: ['*/docs/**/*.mdx'],
    schema: frontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    files: ['*/docs/**/meta.json'],
  },
});

export const articleCollection = defineCollections({
  type: 'doc',
  dir: './content',
  files: ['*/articles/**/*.mdx'],
  schema: zArticle,
});

export const pageCollection = defineCollections({
  type: 'doc',
  dir: './content',
  files: ['*/pages/**/*.mdx'],
  schema: zPage,
});

export const guideCollection = defineCollections({
  type: 'doc',
  dir: './content',
  files: ['*/guides/**/*.mdx'],
  schema: zGuide,
});

export const apiRefCollection = defineCollections({
  type: 'doc',
  dir: './content',
  files: ['*/docs/api-reference/*.mdx'],
  schema: frontmatterSchema,
});

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});
