import { DocsShell } from '@/components/docs/docs-shell';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DocsShell tree={source.pageTree}>{children}</DocsShell>;
}
