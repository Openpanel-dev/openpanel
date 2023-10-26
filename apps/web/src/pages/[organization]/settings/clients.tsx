import { api } from "@/utils/api";
import { ContentHeader } from "@/components/Content";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";
import { DataTable } from "@/components/DataTable";
import { columns } from "@/components/clients/table";
import { Button } from "@/components/ui/button";
import { pushModal } from "@/modals";
import { createServerSideProps } from "@/server/getServerSideProps";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";

export const getServerSideProps = createServerSideProps()

export default function Clients() {
  const params = useOrganizationParams();
  const query = api.client.list.useQuery({
    organizationSlug: params.organization,
  });
  const data = query.data ?? [];
  return (
    <SettingsLayout>
      <ContentHeader title="Clients" text="List of your clients">
        <Button onClick={() => pushModal("AddClient")}>Create</Button>
      </ContentHeader>
      <DataTable data={data} columns={columns} />
    </SettingsLayout>
  );
}
