'use client';

import { useSelectedLayoutSegments } from 'next/navigation';

const NOT_MIGRATED_PAGES = ['reports'];

export default function LayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const segments = useSelectedLayoutSegments();

  if (segments[0] && NOT_MIGRATED_PAGES.includes(segments[0])) {
    return <div className="transition-all lg:pl-72">{children}</div>;
  }

  return <div className="transition-all max-lg:mt-12 lg:pl-72">{children}</div>;
}
