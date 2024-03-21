import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';

import { getClientsByOrganizationId } from '@openpanel/db';

import ListClients from './list-clients';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const clients = await getClientsByOrganizationId(organizationId);

  return (
    <PageLayout title="Clients" organizationSlug={organizationId}>
      <ListClients clients={clients} />
    </PageLayout>
  );
}
