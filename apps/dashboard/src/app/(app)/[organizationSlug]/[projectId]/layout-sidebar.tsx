'use client';

import { LogoSquare } from '@/components/logo';
import SettingsToggle from '@/components/settings-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { MenuIcon, XIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import type {
  IServiceDashboards,
  IServiceOrganization,
  getProjectsByOrganizationSlug,
} from '@openpanel/db';

import LayoutMenu from './layout-menu';
import LayoutProjectSelector from './layout-project-selector';

interface LayoutSidebarProps {
  organizations: IServiceOrganization[];
  dashboards: IServiceDashboards;
  organizationSlug: string;
  projectId: string;
  projects: Awaited<ReturnType<typeof getProjectsByOrganizationSlug>>;
}
export function LayoutSidebar({
  organizations,
  dashboards,
  projects,
}: LayoutSidebarProps) {
  const [active, setActive] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setActive(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setActive(false)}
        className={cn(
          'fixed bottom-0 left-0 right-0 top-0 z-50 backdrop-blur-sm transition-opacity',
          active
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0',
        )}
      />
      <div
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-border bg-card transition-transform',
          '-translate-x-72 lg:-translate-x-0', // responsive
          active && 'translate-x-0', // force active on mobile
        )}
      >
        <div className="absolute -right-12 flex h-16 items-center lg:hidden">
          <Button
            size="icon"
            onClick={() => setActive((p) => !p)}
            variant={'outline'}
          >
            {active ? <XIcon size={16} /> : <MenuIcon size={16} />}
          </Button>
        </div>
        <div className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-4">
          <LogoSquare className="max-h-8" />
          <LayoutProjectSelector
            align="start"
            projects={projects}
            organizations={organizations}
          />
          <SettingsToggle />
        </div>
        <div className="flex flex-grow flex-col gap-2 overflow-auto p-4">
          <LayoutMenu dashboards={dashboards} />
        </div>
        <div className="fixed bottom-0 left-0 right-0">
          <div className="h-8 w-full bg-gradient-to-t from-card to-card/0" />
        </div>
      </div>
    </>
  );
}
