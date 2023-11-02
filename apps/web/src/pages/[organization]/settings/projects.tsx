import { ContentHeader } from '@/components/Content';
import { DataTable } from '@/components/DataTable';
import { SettingsLayout } from '@/components/layouts/SettingsLayout';
import { columns } from '@/components/projects/table';
import { Button } from '@/components/ui/button';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { pushModal } from '@/modals';
import { createServerSideProps } from '@/server/getServerSideProps';
import { api } from '@/utils/api';

export const getServerSideProps = createServerSideProps();

export default function Projects() {
  const params = useOrganizationParams();
  const query = api.project.list.useQuery({
    organizationSlug: params.organization,
  });
  const data = query.data ?? [];
  return (
    <SettingsLayout>
      <ContentHeader title="Projects" text="List of your projects">
        <Button onClick={() => pushModal('AddProject')}>Create</Button>
      </ContentHeader>
      <DataTable data={data} columns={columns} />
    </SettingsLayout>
  );
}
