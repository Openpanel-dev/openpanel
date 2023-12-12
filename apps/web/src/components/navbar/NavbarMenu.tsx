import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { cn } from '@/utils/cn';
import { strip } from '@/utils/object';
import type { LinkProps } from 'next/link';
import Link from 'next/link';

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
      {params.project && (
        <Item href={`/${params.organization}/${params.project}`}>Home</Item>
      )}
      {params.project && (
        <Item href={`/${params.organization}/${params.project}/events`}>
          Events
        </Item>
      )}
      {params.project && (
        <Item href={`/${params.organization}/${params.project}/profiles`}>
          Profiles
        </Item>
      )}
      {params.project && (
        <Item
          href={{
            pathname: `/${params.organization}/${params.project}/reports`,
            query: strip({
              dashboard: params.dashboard,
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
