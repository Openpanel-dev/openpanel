import { Callout } from 'fumadocs-ui/components/callout';
import Link from 'next/link';

export function DeviceIdWarning() {
  return (
    <Callout>
      Read more about{' '}
      <Link href="/docs/device-id">device id and why you might want it</Link>.
      **We recommend not to but it&apos;s up to you.**
    </Callout>
  );
}
