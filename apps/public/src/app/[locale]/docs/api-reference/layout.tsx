import { localizedHref, toAppLocale } from '@/i18n/routing';
import { baseOptions } from '@/lib/layout.shared';
import { API_REFERENCE_BASE_URL, getApiReferenceSource } from '@/lib/openapi';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { BookOpenIcon, CodeIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function Layout({ children, params }: LayoutProps) {
  const { locale: localeParam } = await params;
  const locale = toAppLocale(localeParam);
  const apiSource = await getApiReferenceSource(locale);
  const t = await getTranslations('pages');

  const tabs = [
    {
      title: t('docs_documentation'),
      description: t('docs_guides_and_references'),
      url: localizedHref('/docs', locale),
      icon: <BookOpenIcon className="size-4 text-blue-500" />,
    },
    {
      title: t('docs_api_reference'),
      description: t('docs_rest_api_endpoints'),
      url: localizedHref(API_REFERENCE_BASE_URL, locale),
      icon: <CodeIcon className="size-4 text-yellow-500" />,
      $folder: apiSource.pageTree as never,
    },
  ];

  return (
    <DocsLayout tabs={tabs} tree={apiSource.pageTree} {...baseOptions(locale)}>
      {children}
    </DocsLayout>
  );
}
