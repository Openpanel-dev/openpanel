import { DocsShell } from '@/components/docs/docs-shell';
import { getApiReferenceSource } from '@/lib/openapi';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const apiSource = await getApiReferenceSource();
  return <DocsShell tree={apiSource.pageTree}>{children}</DocsShell>;
}
