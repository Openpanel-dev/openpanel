import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { BookOpenIcon, CodeIcon } from 'lucide-react';
import { baseOptions } from '@/lib/layout.shared';
import { API_REFERENCE_BASE_URL } from '@/lib/openapi';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: React.ReactNode }) {
  const tabs = [
    {
      title: 'Documentation',
      description: 'Guides and references',
      url: '/docs',
      icon: <BookOpenIcon className="size-4 text-blue-500" />,
      $folder: source.pageTree as never,
    },
    {
      title: 'API Reference',
      description: 'REST API endpoints',
      url: API_REFERENCE_BASE_URL,
      icon: <CodeIcon className="size-4 text-yellow-500" />,
    },
  ];

  return (
    <DocsLayout tabs={tabs} tree={source.pageTree} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
