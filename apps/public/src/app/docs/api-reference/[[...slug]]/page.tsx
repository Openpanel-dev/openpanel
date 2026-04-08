import React from 'react';
import { getMDXComponents } from '@/mdx-components';
import { getApiReferenceSource, openapi } from '@/lib/openapi';
import { createAPIPage } from 'fumadocs-openapi/ui';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound, redirect } from 'next/navigation';

const APIPage = createAPIPage(openapi);

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const source = await getApiReferenceSource();

  if (!params.slug) {
    const first = source.getPages()[0];
    if (first) redirect(first.url);
    notFound();
  }

  const page = source.getPage(params.slug);
  if (!page) notFound();

  const data = page.data as Record<string, unknown>;

  // Static MDX page
  if (typeof data.body === 'function') {
    const MDX = data.body as React.FC<{ components?: Record<string, unknown> }>;
    const toc = data.toc as React.ComponentProps<typeof DocsPage>['toc'];
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{page.data.title}</DocsTitle>
        {page.data.description && (
          <DocsDescription>{page.data.description}</DocsDescription>
        )}
        <DocsBody>
          <MDX components={getMDXComponents()} />
        </DocsBody>
      </DocsPage>
    );
  }

  // OpenAPI generated page
  const { getAPIPageProps } = data as { getAPIPageProps: () => React.ComponentProps<typeof APIPage> };
  return (
    <DocsPage>
      <DocsTitle>{page.data.title}</DocsTitle>
      {page.data.description && (
        <DocsDescription>{page.data.description}</DocsDescription>
      )}
      <DocsBody>
        <APIPage {...getAPIPageProps()} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  const source = await getApiReferenceSource();
  return source.generateParams();
}

export const dynamic = 'force-dynamic';
