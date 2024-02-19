'use client';

import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { cn } from '@/utils/cn';
import { Rotate as Hamburger } from 'hamburger-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { IServiceDashboards, IServiceOrganization } from '@mixan/db';

import LayoutMenu from './layout-menu';
import LayoutOrganizationSelector from './layout-organization-selector';

interface LayoutSidebarProps {
  organizations: IServiceOrganization[];
  dashboards: IServiceDashboards;
}
export function LayoutSidebar({
  organizations,
  dashboards,
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
          'fixed top-0 left-0 right-0 bottom-0 backdrop-blur-sm z-30 transition-opacity',
          active
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        )}
      />
      <div
        className={cn(
          'fixed top-0 left-0 h-screen border-r border-border w-72 bg-white flex flex-col z-30 transition-transform',
          '-translate-x-72 lg:-translate-x-0', // responsive
          active && 'translate-x-0' // force active on mobile
        )}
      >
        <div className="absolute -right-12 h-16 flex items-center lg:hidden">
          <Hamburger toggled={active} onToggle={setActive} size={20} />
        </div>
        <div className="h-16 border-b border-border px-4 shrink-0 flex items-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-col p-4 gap-2 flex-grow overflow-auto">
          <LayoutMenu dashboards={dashboards} />
          {/* Placeholder for LayoutOrganizationSelector */}
          <div className="h-16 block shrink-0"></div>
        </div>
        <div className="fixed bottom-0 left-0 right-0">
          <div className="bg-gradient-to-t from-white to-white/0 h-8 w-full"></div>
          <div className="bg-white p-4 pt-0">
            <LayoutOrganizationSelector organizations={organizations} />
          </div>
        </div>
      </div>
    </>
  );
}
