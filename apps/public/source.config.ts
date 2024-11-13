import { remarkGfm } from 'fumadocs-core/mdx-plugins';
import {
  defineCollections,
  defineConfig,
  defineDocs,
} from 'fumadocs-mdx/config';
import rehypeExternalLinks from 'rehype-external-links';
import { z } from 'zod';
const zArticle = z.object({
  title: z.string().min(1),
  description: z.string(),
  tag: z.string().optional(),
  team: z.string().optional(),
  date: z.date(),
  cover: z.string().default('/content/cover-default.jpg'),
});
const zPage = z.object({
  title: z.string().min(1),
  description: z.string(),
});

export const { docs, meta } = defineDocs({
  dir: 'content/docs',
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

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeExternalLinks],
  },
});
