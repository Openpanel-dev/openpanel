import React from 'react';
import { localizedHref, locales, toAppLocale } from '@/i18n/routing';
import { getApiReferenceSource, openapi } from '@/lib/openapi';
import { getMDXComponents } from '@/mdx-components';
import { createAPIPage } from 'fumadocs-openapi/ui';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound, redirect } from 'next/navigation';

const APIPage = createAPIPage(openapi);

type PageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

export default async function Page(props: PageProps) {
  const params = await props.params;
  const locale = toAppLocale(params.locale);
  const source = await getApiReferenceSource(locale);

  if (!params.slug) {
    const first = source.getPages()[0];
    if (first) redirect(localizedHref(first.url, locale));
    notFound();
  }

  const page = source.getPage(params.slug);
  if (!page) notFound();

  const data = page.data as Record<string, unknown>;

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
          <MDX components={getMDXComponents(undefined, locale)} />
        </DocsBody>
      </DocsPage>
    );
  }

  const { getAPIPageProps } = data as {
    getAPIPageProps: () => React.ComponentProps<typeof APIPage>;
  };

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
  const params = await Promise.all(
    locales.map(async (locale) => {
      const source = await getApiReferenceSource(locale);
      return source.generateParams().map((param) => ({
      ...param,
      locale,
      }));
    }),
  );

  return params.flat();
}

export const dynamic = 'force-dynamic';
