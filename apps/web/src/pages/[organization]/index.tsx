import { MainLayout } from "@/components/layouts/MainLayout";
import { Container } from "@/components/Container";
import { api } from "@/utils/api";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { useOrganizationParams } from "@/hooks/useOrganizationParams";
import { Card } from "@/components/Card";
import { createServerSideProps } from "@/server/getServerSideProps";

export const getServerSideProps = createServerSideProps()

export default function Home() {
  const params = useOrganizationParams(
  );

  const query = api.project.list.useQuery({
    organizationSlug: params.organization,
  }, {
    enabled: !!params.organization,
  });
  
  const projects = query.data ?? [];

  return (
    <MainLayout>
      <Container>
        <PageTitle>Reports</PageTitle>
        <div className="grid grid-cols-2 gap-4">
          {projects.map((item) => (
            <Card key={item.id}>
              <Link
                href={`/${params.organization}/${item.slug}`}
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
