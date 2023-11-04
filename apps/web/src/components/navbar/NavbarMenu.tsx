import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { cn } from '@/utils/cn';
import Link from 'next/link';

import { NavbarUserDropdown } from './NavbarUserDropdown';

export function NavbarMenu() {
  const params = useOrganizationParams();
  return (
    <div className={cn('flex gap-6 items-center text-sm', 'max-sm:flex-col')}>
      {params.project && (
        <Link shallow href={`/${params.organization}/${params.project}`}>
          Home
        </Link>
      )}
      {params.project && (
        <Link shallow href={`/${params.organization}/${params.project}/events`}>
          Events
        </Link>
      )}
      {params.project && (
        <Link
          shallow
          href={`/${params.organization}/${params.project}/profiles`}
        >
          Profiles
        </Link>
      )}
      {params.project && (
        <Link
          shallow
          href={`/${params.organization}/${params.project}/reports`}
        >
          Create report
        </Link>
      )}
      <NavbarUserDropdown />
    </div>
  );
}
