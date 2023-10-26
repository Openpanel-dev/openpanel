import { MainLayout } from "@/components/layouts/MainLayout";
import { Container } from "@/components/Container";
import { api } from "@/utils/api";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/Card";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { createServerSideProps } from "@/server/getServerSideProps";

export const getServerSideProps = createServerSideProps()

export default function Home() {
  const params = useOrganizationParams();
  const query = api.dashboard.list.useQuery({
    organizationSlug: params.organization,
    projectSlug: params.project,
  }, {
    enabled: Boolean(params.organization && params.project),
  });
  const dashboards = query.data ?? [];

  return (
    <MainLayout>
      <Container>
        <PageTitle>Dashboards</PageTitle>
        <div className="grid grid-cols-2 gap-4">
          {dashboards.map((item) => (
            <Card key={item.id}>
            <Link
              href={`/${params.organization}/${params.project}/${item.slug}`}
              className="block p-4 font-medium leading-none hover:underline"
            >
              {item.name}
            </Link>
          </Card>
          ))}
        </div>
      </Container>
    </MainLayout>
  );
}
