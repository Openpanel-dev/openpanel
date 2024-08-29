'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { useUser } from '@clerk/nextjs';
import {
  GanttChartIcon,
  Globe2Icon,
  LayoutPanelTopIcon,
  PlusIcon,
  ScanEyeIcon,
  UsersIcon,
  WallpaperIcon,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { IServiceDashboards } from '@openpanel/db';

function LinkWithIcon({
  href,
  icon: Icon,
  label,
  active: overrideActive,
  className,
}: {
  href: string;
  icon: React.ElementType<LucideProps>;
  label: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const active = overrideActive || href === pathname;
  return (
    <Link
      className={cn(
        'text-text flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200',
        active && 'bg-def-200',
        className
      )}
      href={href}
    >
      <Icon size={20} />
      <div className="flex-1">{label}</div>
    </Link>
  );
}

interface LayoutMenuProps {
  dashboards: IServiceDashboards;
}
export default function LayoutMenu({ dashboards }: LayoutMenuProps) {
  const { user } = useUser();

  const params = useAppParams();
  const hasProjectId =
    params.projectId &&
    params.projectId !== 'null' &&
    params.projectId !== 'undefined';
  const projectId = hasProjectId
    ? params.projectId
    : (user?.unsafeMetadata.projectId as string);

  useEffect(() => {
    if (hasProjectId) {
      user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          projectId: params.projectId,
        },
      });
    }
  }, [params.projectId, hasProjectId]);

  return (
    <>
      <LinkWithIcon
        icon={WallpaperIcon}
        label="Overview"
        href={`/${params.organizationSlug}/${projectId}`}
      />
      <LinkWithIcon
        icon={LayoutPanelTopIcon}
        label="Dashboards"
        href={`/${params.organizationSlug}/${projectId}/dashboards`}
      />
      <LinkWithIcon
        icon={Globe2Icon}
        label="Realtime"
        href={`/${params.organizationSlug}/${projectId}/realtime`}
      />
      <LinkWithIcon
        icon={GanttChartIcon}
        label="Events"
        href={`/${params.organizationSlug}/${projectId}/events`}
      />
      <LinkWithIcon
        icon={UsersIcon}
        label="Profiles"
        href={`/${params.organizationSlug}/${projectId}/profiles`}
      />
      <LinkWithIcon
        icon={ScanEyeIcon}
        label="Retention"
        href={`/${params.organizationSlug}/${projectId}/retention`}
      />

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-muted-foreground">Your dashboards</div>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => pushModal('AddDashboard')}
          >
            <PlusIcon size={16} />
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {dashboards.map((item) => (
            <LinkWithIcon
              key={item.id}
              icon={LayoutPanelTopIcon}
              label={item.name}
              href={`/${item.organizationSlug}/${item.projectId}/dashboards/${item.id}`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
