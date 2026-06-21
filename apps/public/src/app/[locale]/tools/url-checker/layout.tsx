import { getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    url: '/tools/url-checker',
    title: t('tools_url_checker_metadata_title'),
    description: t('tools_url_checker_metadata_description'),
  });
}

export default function IPLookupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
