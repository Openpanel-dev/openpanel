import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';
import { getClientsByOrganizationId } from '@/server/services/clients.service';

import ListClients from './list-clients';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  await getExists(organizationId);
  const clients = await getClientsByOrganizationId(organizationId);

  return (
    <PageLayout title="Clients" organizationSlug={organizationId}>
      <ListClients clients={clients} />
    </PageLayout>
  );
}
