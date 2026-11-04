import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsHome } from '@/components/docs/docs-home';
import { DocsTocFooter } from '@/components/docs/docs-toc-footer';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

const GITHUB_CONTENT_URL =
  'https://github.com/Openpanel-dev/openpanel/blob/main/apps/public/content/docs';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  const MDX = page.data.body;
  const isHome = !params.slug?.length;
  const githubUrl = `${GITHUB_CONTENT_URL}/${page.path}`;

  return (
    <DocsPage
      full={page.data.full}
      tableOfContent={{ footer: <DocsTocFooter githubUrl={githubUrl} /> }}
      toc={page.data.toc}
    >
      {isHome ? (
        <DocsHome />
      ) : (
        <header className="col gap-3 border-black/6 border-b pb-6">
          <DocsTitle className="font-semibold text-3xl tracking-[-0.03em] md:text-4xl">
            {page.data.title}
          </DocsTitle>
          <DocsDescription className="mb-0 text-lg text-neutral-600">
            {page.data.description}
          </DocsDescription>
          <div className="row flex-wrap gap-2">
            <MarkdownCopyButton markdownUrl={`${page.url}.md`} />
            <ViewOptionsPopover
              githubUrl={githubUrl}
              markdownUrl={`${page.url}.md`}
              pageUrl={url(page.url)}
            />
          </div>
        </header>
      )}
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  return getPageMetadata({
    title: page.data.title,
    url: url(page.url),
    description: page.data.description ?? '',
    image: getOgImageUrl(page.url),
  });
}
