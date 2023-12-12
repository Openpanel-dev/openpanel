import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { api } from '@/utils/api';
import { ChevronRight, HomeIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Container } from '../Container';

export function Breadcrumbs() {
  const params = useOrganizationParams();

  const org = api.organization.get.useQuery(
    {
      slug: params.organization,
    },
    {
      enabled: !!params.organization,
      staleTime: Infinity,
    }
  );

  const pro = api.project.get.useQuery(
    {
      slug: params.project,
    },
    {
      enabled: !!params.project,
      staleTime: Infinity,
    }
  );

  const dashboard = api.dashboard.get.useQuery(
    {
      slug: params.dashboard,
    },
    {
      enabled: !!params.dashboard,
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
            <Link shallow href={`/${org.data.slug}`}>
              {org.data.name}
            </Link>
          </>
        )}

        {org.data && pro.data && (
          <>
            <ChevronRight size={10} />
            <Link shallow href={`/${org.data.slug}/${pro.data.slug}`}>
              {pro.data.name}
            </Link>
          </>
        )}

        {org.data && pro.data && dashboard.data && (
          <>
            <ChevronRight size={10} />
            <Link
              shallow
              href={`/${org.data.slug}/${pro.data.slug}/${dashboard.data.slug}`}
            >
              {dashboard.data.name}
            </Link>
          </>
        )}
      </Container>
    </div>
  );
}
