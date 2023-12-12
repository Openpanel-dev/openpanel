import { Card, CardActions, CardActionsItem } from '@/components/Card';
import { Container } from '@/components/Container';
import { MainLayout } from '@/components/layouts/MainLayout';
import { PageTitle } from '@/components/PageTitle';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { useRefetchActive } from '@/hooks/useRefetchActive';
import { pushModal } from '@/modals';
import { createServerSideProps } from '@/server/getServerSideProps';
import { api, handleError } from '@/utils/api';
import { Plus, Trash } from 'lucide-react';
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
  const deletion = api.dashboard.delete.useMutation({
    onError: handleError,
    onSuccess() {
      query.refetch();
    },
  });

  return (
    <MainLayout>
      <Container>
        <PageTitle>Dashboards</PageTitle>
        <div className="grid sm:grid-cols-2 gap-4">
          {dashboards.map((item) => (
            <Card key={item.id} hover>
              <Link
                href={`/${params.organization}/${params.project}/${item.slug}`}
                className="block p-4 font-medium leading-none"
                shallow
              >
                {item.name}
              </Link>

              <CardActions>
                <CardActionsItem className="text-destructive w-full" asChild>
                  <button
                    onClick={() => {
                      deletion.mutate({
                        id: item.id,
                      });
                    }}
                  >
                    <Trash size={16} />
                    Delete
                  </button>
                </CardActionsItem>
              </CardActions>
            </Card>
          ))}
          <Card hover className="border-dashed">
            <button
              className="flex items-center justify-between w-full p-4 font-medium leading-none"
              onClick={() => {
                pushModal('AddDashboard', {
                  projectSlug: params.project,
                  organizationSlug: params.organization,
                });
              }}
            >
              Create new dashboard
              <Plus size={16} />
            </button>
          </Card>
        </div>
      </Container>
    </MainLayout>
  );
}
