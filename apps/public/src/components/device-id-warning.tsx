import { Callout } from 'fumadocs-ui/components/callout';
import Link from 'next/link';
import { localizedHref } from '@/i18n/routing';
import { getAppLocale } from '@/i18n/server';

export async function DeviceIdWarning() {
  const locale = await getAppLocale();

  return (
    <Callout>
      Read more about{' '}
      <Link href={localizedHref('/docs/device-id', locale)}>
        device id and why you might want it
      </Link>
      .
      **We recommend not to but it&apos;s up to you.**
    </Callout>
  );
}
