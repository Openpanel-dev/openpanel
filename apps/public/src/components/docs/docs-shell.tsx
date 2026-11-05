import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { LayoutTab } from 'fumadocs-ui/layouts/shared';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CodeIcon,
} from 'lucide-react';
import Link from 'next/link';
import { baseOptions } from '@/lib/layout.shared';
import { API_REFERENCE_BASE_URL } from '@/lib/openapi';
import { source } from '@/lib/source';

const HELP_LINKS = [
  { text: 'openpanel.dev', href: '/' },
  { text: 'GitHub', href: 'https://github.com/Openpanel-dev/openpanel' },
  { text: 'Discord', href: 'https://go.openpanel.dev/discord' },
];

// Docs and the API reference share the /docs prefix, so the docs tab lists
// its own pages instead of matching on the prefix.
const DOCS_URLS = new Set(
  source
    .getPages()
    .map((page) => page.url)
    .filter((url) => !url.startsWith(API_REFERENCE_BASE_URL))
);

const TABS: LayoutTab[] = [
  {
    title: 'Documentation',
    description: 'Guides, SDKs and self-hosting',
    url: '/docs',
    urls: DOCS_URLS,
    icon: <BookOpenIcon className="size-4" />,
  },
  {
    title: 'API reference',
    description: 'Every REST endpoint',
    url: API_REFERENCE_BASE_URL,
    icon: <CodeIcon className="size-4" />,
  },
];

function SidebarFooter() {
  return (
    <div className="col gap-3 pt-2">
      <a
        className="surface surface-hover row items-center justify-between gap-3 p-3"
        href="https://dashboard.openpanel.dev/onboarding"
      >
        <span className="col">
          <span className="font-medium text-sm">Try OpenPanel Cloud</span>
          <span className="text-neutral-500 text-xs">
            30-day free trial, EU hosted
          </span>
        </span>
        <span className="center-center size-7 shrink-0 rounded-lg bg-neutral-900 text-white">
          <ArrowRightIcon className="size-3.5" />
        </span>
      </a>
      <nav
        aria-label="OpenPanel"
        className="row flex-wrap gap-x-4 gap-y-1 px-1"
      >
        {HELP_LINKS.map((link) => {
          const isExternal = link.href.startsWith('http');
          return (
            <Link
              className="row items-center gap-0.5 text-neutral-500 text-xs transition-colors hover:text-neutral-900"
              href={link.href}
              key={link.href}
              {...(isExternal ? { rel: 'noopener', target: '_blank' } : {})}
            >
              {link.text}
              {isExternal && <ArrowUpRightIcon className="size-3" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function DocsShell({
  tree,
  children,
}: {
  tree: PageTree.Root;
  children: React.ReactNode;
}) {
  return (
    <DocsLayout
      {...baseOptions()}
      sidebar={{ footer: <SidebarFooter /> }}
      tabs={TABS}
      tree={tree}
    >
      {children}
    </DocsLayout>
  );
}
