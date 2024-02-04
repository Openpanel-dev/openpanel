import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { cn } from '@/utils/cn';
import type { LinkProps } from 'next/link';
import Link from 'next/link';

import { strip } from '@mixan/common';

import { NavbarUserDropdown } from './NavbarUserDropdown';

function Item({
  children,
  ...props
}: LinkProps & { children: React.ReactNode }) {
  return (
    <Link
      {...props}
      className="h-9 items-center flex px-3 leading-none relative [&>div]:hover:opacity-100 [&>div]:hover:ring-1"
      shallow
    >
      <div className="opacity-0 absolute inset-0 transition-all bg-gradient-to-r from-blue-50 to-purple-50 rounded ring-0 ring-purple-900" />
      <span className="relative">{children}</span>
    </Link>
  );
}

export function NavbarMenu() {
  const params = useOrganizationParams();
  return (
    <div className={cn('flex gap-1 items-center text-sm', 'max-sm:flex-col')}>
      {params.projectId && (
        <Item href={`/${params.organizationId}/${params.projectId}`}>
          Dashboards
        </Item>
      )}
      {params.projectId && (
        <Item href={`/${params.organizationId}/${params.projectId}/events`}>
          Events
        </Item>
      )}
      {params.projectId && (
        <Item href={`/${params.organizationId}/${params.projectId}/profiles`}>
          Profiles
        </Item>
      )}
      {params.projectId && (
        <Item
          href={{
            pathname: `/${params.organizationId}/${params.projectId}/reports`,
            query: strip({
              dashboardId: params.dashboardId,
            }),
          }}
        >
          Create report
        </Item>
      )}
      <NavbarUserDropdown />
    </div>
  );
}
