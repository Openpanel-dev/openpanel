import { PATTable } from '@/components/pat/table';
import { PageHeader } from '@/components/page-header';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createOrganizationTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$organizationId/tokens')({
  component: Component,
  head: () => ({
    meta: [{ title: createOrganizationTitle(PAGE_TITLES.TOKENS) }],
  }),
});

function Component() {
  const { organizationId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.pat.list.queryOptions({ organizationId }),
  );

  return (
    <div className="container p-8">
      <PageHeader
        title="Personal Access Tokens"
        description="Tokens let you authenticate with the OpenPanel API from scripts, CLI tools, and CI/CD pipelines."
        className="mb-8"
      />
      <PATTable organizationId={organizationId} query={query} />
    </div>
  );
}
