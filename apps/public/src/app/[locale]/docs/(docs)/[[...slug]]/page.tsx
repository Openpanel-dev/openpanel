import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { API_REFERENCE_BASE_URL } from '@/lib/openapi';
import { localizedHref, toAppLocale } from '@/i18n/routing';
import {
  generateDocsParams,
  getDocsPage,
  getDocsPageTree,
  getPageImage,
  source,
} from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import Link from 'next/link';
import { isValidElement } from 'react';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { BookOpenIcon, CodeIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { baseOptions } from '@/lib/layout.shared';
import { getTranslations } from 'next-intl/server';

type PageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

export default async function Page(props: PageProps) {
  const params = await props.params;
  const locale = toAppLocale(params.locale);
  const slugs = params.slug ?? [];
  const t = await getTranslations('pages');
  const page = getDocsPage(slugs, locale);
  if (!page) notFound();

  const MDX = page.data.body;
  const pageTree = getDocsPageTree(locale);
  const RelativeLink = createRelativeLink(source, page);
  const tabs = [
    {
      title: t('docs_documentation'),
      description: t('docs_guides_and_references'),
      url: localizedHref('/docs', locale),
      icon: <BookOpenIcon className="size-4 text-blue-500" />,
      $folder: pageTree as never,
    },
    {
      title: t('docs_api_reference'),
      description: t('docs_rest_api_endpoints'),
      url: localizedHref(API_REFERENCE_BASE_URL, locale),
      icon: <CodeIcon className="size-4 text-yellow-500" />,
    },
  ];

  return (
    <DocsLayout tabs={tabs} tree={pageTree} {...baseOptions(locale)}>
      <DocsPage toc={page.data.toc} full={page.data.full}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDX
            components={getMDXComponents({
              // this allows you to link to other pages with relative file paths
              a: (props) => {
                const link = RelativeLink(props);

                if (!isValidElement<{ href?: unknown }>(link)) {
                  return link;
                }

                const href = link.props.href;

                if (typeof href !== 'string') {
                  return link;
                }

                return <Link {...link.props} href={localizedHref(href, locale)} />;
              },
            }, locale)}
          />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}

export async function generateStaticParams() {
  return generateDocsParams();
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const locale = toAppLocale(params.locale);
  const slugs = params.slug ?? [];
  const page = getDocsPage(slugs, locale);
  if (!page) notFound();

  return getPageMetadata({
    title: page.data.title,
    url: url(page.url),
    description: page.data.description ?? '',
    image: getOgImageUrl(page.url),
  });
}
