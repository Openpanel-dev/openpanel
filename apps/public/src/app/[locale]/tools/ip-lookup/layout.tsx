import { getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getPageMetadata({
    url: '/tools/ip-lookup',
    title: t('tools_ip_lookup_metadata_title'),
    description: t('tools_ip_lookup_metadata_description'),
  });
}

export default function IPLookupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
