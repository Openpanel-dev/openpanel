import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing-shell';

export default function Layout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <MarketingShell mainClassName="overflow-hidden">{children}</MarketingShell>
  );
}
