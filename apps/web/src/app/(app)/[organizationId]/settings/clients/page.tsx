import PageLayout from '@/app/(app)/page-layout';
import { getClientsByOrganizationId } from '@/server/services/clients.service';

import ListClients from './list-clients';

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default async function Page({ params: { organizationId } }: PageProps) {
  const clients = await getClientsByOrganizationId(organizationId);

  return (
    <PageLayout title="Clients" organizationId={organizationId}>
      <ListClients clients={clients} />
    </PageLayout>
  );
}
