import { api } from '@/app/_trpc/client';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { ChevronRight, HomeIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Container } from '../Container';

export function Breadcrumbs() {
  const params = useOrganizationParams();

  const org = api.organization.get.useQuery(
    {
      id: params.organizationId,
    },
    {
      enabled: !!params.organizationId,
      staleTime: Infinity,
    }
  );

  const pro = api.project.get.useQuery(
    {
      id: params.projectId,
    },
    {
      enabled: !!params.projectId,
      staleTime: Infinity,
    }
  );

  const dashboard = api.dashboard.get.useQuery(
    {
      id: params.dashboardId,
    },
    {
      enabled: !!params.dashboardId,
      staleTime: Infinity,
    }
  );

  return (
    <div className="border-b border-border text-xs">
      <Container className="flex items-center gap-2 h-8">
        {org.isLoading && pro.isLoading && (
          <div className="animate-pulse bg-slate-200 h-4 w-24 rounded"></div>
        )}
        {org.data && (
          <>
            <HomeIcon size={14} />
            <Link shallow href={`/${org.data.id}`}>
              {org.data.name}
            </Link>
          </>
        )}

        {org.data && pro.data && (
          <>
            <ChevronRight size={10} />
            <Link shallow href={`/${org.data.id}/${pro.data.id}`}>
              {pro.data.name}
            </Link>
          </>
        )}

        {org.data && pro.data && dashboard.data && (
          <>
            <ChevronRight size={10} />
            <Link
              shallow
              href={`/${org.data.id}/${pro.data.id}/${dashboard.data.id}`}
            >
              {dashboard.data.name}
            </Link>
          </>
        )}
      </Container>
    </div>
  );
}
