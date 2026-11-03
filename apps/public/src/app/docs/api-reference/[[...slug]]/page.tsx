import type { OpenAPIPageData } from 'fumadocs-openapi/server';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type React from 'react';
import { OpenAPIPage } from '@/components/docs/openapi-page';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { getApiReferenceSource } from '@/lib/openapi';
import { getMDXComponents } from '@/mdx-components';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const source = await getApiReferenceSource();

  if (!params.slug) {
    const first = source.getPages()[0];
    if (first) {
      redirect(first.url);
    }
    notFound();
  }

  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  const data = page.data as Record<string, unknown>;

  // Static MDX page
  if (typeof data.body === 'function') {
    const MDX = data.body as React.FC<{ components?: Record<string, unknown> }>;
    const toc = data.toc as React.ComponentProps<typeof DocsPage>['toc'];
    return (
      <DocsPage toc={toc}>
        <DocsTitle className="font-semibold text-3xl tracking-[-0.03em] md:text-4xl">
          {page.data.title}
        </DocsTitle>
        {page.data.description && (
          <DocsDescription className="text-lg text-neutral-600">
            {page.data.description}
          </DocsDescription>
        )}
        <DocsBody>
          <MDX components={getMDXComponents()} />
        </DocsBody>
      </DocsPage>
    );
  }

  // OpenAPI generated page
  const { getOpenAPIPageProps } = data as unknown as OpenAPIPageData;
  return (
    <DocsPage>
      <DocsTitle className="font-semibold text-3xl tracking-[-0.03em] md:text-4xl">
        {page.data.title}
      </DocsTitle>
      {page.data.description && (
        <DocsDescription className="text-lg text-neutral-600">
          {page.data.description}
        </DocsDescription>
      )}
      <DocsBody>
        <OpenAPIPage {...getOpenAPIPageProps()} />
      </DocsBody>
    </DocsPage>
  );
}

// Without this the reference pages inherit the root metadata and canonicalise
// to the homepage.
export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  if (!params.slug) {
    return {};
  }
  const source = await getApiReferenceSource();
  const page = source.getPage(params.slug);
  if (!page) {
    return {};
  }
  return getPageMetadata({
    title: page.data.title ?? 'API reference',
    url: url(page.url),
    description: page.data.description ?? '',
    image: getOgImageUrl(page.url),
  });
}

export async function generateStaticParams() {
  const source = await getApiReferenceSource();
  return source.generateParams();
}

export const dynamic = 'force-dynamic';
