import { Card } from '@/components/Card';
import { Container } from '@/components/Container';
import { MainLayout } from '@/components/layouts/MainLayout';
import { PageTitle } from '@/components/PageTitle';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { createServerSideProps } from '@/server/getServerSideProps';
import { api } from '@/utils/api';
import Link from 'next/link';

export const getServerSideProps = createServerSideProps();

export default function Home() {
  const params = useOrganizationParams();
  const query = api.dashboard.list.useQuery(
    {
      projectSlug: params.project,
    },
    {
      enabled: Boolean(params.organization && params.project),
    }
  );
  const dashboards = query.data ?? [];

  return (
    <MainLayout>
      <Container>
        <PageTitle>Dashboards</PageTitle>
        <div className="grid sm:grid-cols-2 gap-4">
          {dashboards.map((item) => (
            <Card key={item.id}>
              <Link
                href={`/${params.organization}/${params.project}/${item.slug}`}
                className="block p-4 font-medium leading-none hover:underline"
                shallow
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
