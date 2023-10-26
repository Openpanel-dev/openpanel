import { api } from "@/utils/api";
import { ContentHeader } from "@/components/Content";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";
import { DataTable } from "@/components/DataTable";
import { columns } from "@/components/projects/table";
import { Button } from "@/components/ui/button";
import { pushModal } from "@/modals";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { createServerSideProps } from "@/server/getServerSideProps";

export const getServerSideProps = createServerSideProps()

export default function Projects() {
  const params = useOrganizationParams()
  const query = api.project.list.useQuery({
    organizationSlug: params.organization
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
