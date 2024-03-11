import Link from 'next/link';
import { Callout } from 'nextra/components';

export function DeviceIdWarning() {
  return (
    <Callout>
      Read more about{' '}
      <Link href="/docs/device-id">device id and why you might want it</Link>.
      **We recommend not to but it's up to you.**
    </Callout>
  );
}
