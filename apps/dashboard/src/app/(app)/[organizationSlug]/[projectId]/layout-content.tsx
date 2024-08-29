'use client';

import { useSelectedLayoutSegments } from 'next/navigation';

const MIGRATED_PAGES = [undefined, 'events', 'dashboards'];

export default function LayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const segments = useSelectedLayoutSegments();
  console.log('segments[0]', segments[0]);
  console.log('segments', segments);

  if (MIGRATED_PAGES.includes(segments[0])) {
    return (
      <div className="transition-all max-lg:mt-12 lg:pl-72">{children}</div>
    );
  }

  return <div className="transition-all lg:pl-72">{children}</div>;
}
