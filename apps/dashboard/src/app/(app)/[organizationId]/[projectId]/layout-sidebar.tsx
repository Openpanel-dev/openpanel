'use client';

import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { Rotate as Hamburger } from 'hamburger-react';
import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { IServiceDashboards, IServiceOrganization } from '@openpanel/db';

import LayoutMenu from './layout-menu';
import LayoutOrganizationSelector from './layout-organization-selector';

interface LayoutSidebarProps {
  organizations: IServiceOrganization[];
  dashboards: IServiceDashboards;
  organizationId: string;
  projectId: string;
}
export function LayoutSidebar({
  organizations,
  dashboards,
  organizationId,
  projectId,
}: LayoutSidebarProps) {
  const [active, setActive] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setActive(false);
  }, [pathname]);

  return (
    <>
      <button
        onClick={() => setActive(false)}
        className={cn(
          'fixed bottom-0 left-0 right-0 top-0 z-30 backdrop-blur-sm transition-opacity',
          active
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />
      <div
        className={cn(
          'fixed left-0 top-0 z-30 flex h-screen w-72 flex-col border-r border-border bg-white transition-transform',
          '-translate-x-72 lg:-translate-x-0', // responsive
          active && 'translate-x-0' // force active on mobile
        )}
      >
        <div className="absolute -right-12 flex h-16 items-center lg:hidden">
          <Hamburger toggled={active} onToggle={setActive} size={20} />
        </div>
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-grow flex-col gap-2 overflow-auto p-4">
          <LayoutMenu dashboards={dashboards} />
          {/* Placeholder for LayoutOrganizationSelector */}
          <div className="block h-32 shrink-0"></div>
        </div>
        <div className="fixed bottom-0 left-0 right-0">
          <div className="h-8 w-full bg-gradient-to-t from-white to-white/0"></div>
          <div className="flex flex-col gap-2 bg-white p-4 pt-0">
            <Link
              className={cn('flex gap-2', buttonVariants())}
              href={`/${organizationId}/${projectId}/reports`}
            >
              <PlusIcon size={16} />
              Create a report
            </Link>
            <LayoutOrganizationSelector organizations={organizations} />
          </div>
        </div>
      </div>
    </>
  );
}
