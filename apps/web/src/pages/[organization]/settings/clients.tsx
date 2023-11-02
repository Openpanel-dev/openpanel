import { columns } from '@/components/clients/table';
import { ContentHeader } from '@/components/Content';
import { DataTable } from '@/components/DataTable';
import { SettingsLayout } from '@/components/layouts/SettingsLayout';
import { Button } from '@/components/ui/button';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { pushModal } from '@/modals';
import { createServerSideProps } from '@/server/getServerSideProps';
import { api } from '@/utils/api';

export const getServerSideProps = createServerSideProps();

export default function Clients() {
  const params = useOrganizationParams();
  const query = api.client.list.useQuery({
    organizationSlug: params.organization,
  });
  const data = query.data ?? [];
  return (
    <SettingsLayout>
      <ContentHeader title="Clients" text="List of your clients">
        <Button onClick={() => pushModal('AddClient')}>Create</Button>
      </ContentHeader>
      <DataTable data={data} columns={columns} />
    </SettingsLayout>
  );
}
