'use client';

import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import {
  BanknoteIcon,
  ChartLineIcon,
  DollarSignIcon,
  GanttChartIcon,
  Globe2Icon,
  HeartHandshakeIcon,
  LayersIcon,
  LayoutPanelTopIcon,
  PlusIcon,
  ScanEyeIcon,
  ServerIcon,
  SparklesIcon,
  UsersIcon,
  WallpaperIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { ProjectLink } from '@/components/links';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CommandShortcut } from '@/components/ui/command';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { IServiceDashboards, IServiceOrganization } from '@openpanel/db';
import { differenceInDays, format } from 'date-fns';

function LinkWithIcon({
  href,
  icon: Icon,
  label,
  active: overrideActive,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const active = overrideActive || href === pathname;
  return (
    <ProjectLink
      className={cn(
        'text-text flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200',
        active && 'bg-def-200',
        className,
      )}
      href={href}
    >
      <Icon size={20} />
      <div className="flex-1">{label}</div>
    </ProjectLink>
  );
}

interface LayoutMenuProps {
  dashboards: IServiceDashboards;
  organization: IServiceOrganization;
}
export default function LayoutMenu({
  dashboards,
  organization,
}: LayoutMenuProps) {
  const number = useNumber();
  const {
    isTrial,
    isExpired,
    isExceeded,
    isCanceled,
    subscriptionEndsAt,
    subscriptionPeriodEventsCount,
    subscriptionPeriodEventsLimit,
    subscriptionProductId,
  } = organization;
  return (
    <>
      <div className="col border rounded mb-2 divide-y">
        {(subscriptionProductId === '036efa2a-b3b4-4c75-b24a-9cac6bb8893b' ||
          subscriptionProductId === 'a18b4bee-d3db-4404-be6f-fba2f042d9ed') && (
          <ProjectLink
            href={'/settings/organization?tab=billing'}
            className={cn(
              'rounded p-2 row items-center gap-2 hover:bg-def-200 text-destructive',
            )}
          >
            <BanknoteIcon size={20} />
            <div className="flex-1 col gap-1">
              <div className="font-medium">Free plan is removed</div>
              <div className="text-sm opacity-80">
                We've removed the free plan. You can upgrade to a paid plan to
                continue using OpenPanel.
              </div>
            </div>
          </ProjectLink>
        )}
        {process.env.NEXT_PUBLIC_SELF_HOSTED === 'true' && (
          <a
            className="rounded p-2 row items-center gap-2 hover:bg-def-200"
            href="https://openpanel.dev/supporter"
          >
            <HeartHandshakeIcon size={20} />
            <div className="flex-1 col gap-1">
              <div className="font-medium">Become a supporter</div>
            </div>
          </a>
        )}
        {isTrial && subscriptionEndsAt && (
          <ProjectLink
            href={'/settings/organization?tab=billing'}
            className={cn(
              'rounded p-2 row items-center gap-2 hover:bg-def-200 text-destructive',
            )}
          >
            <BanknoteIcon size={20} />
            <div className="flex-1 col gap-1">
              <div className="font-medium">
                Free trial ends in{' '}
                {differenceInDays(subscriptionEndsAt, new Date())} days
              </div>
            </div>
          </ProjectLink>
        )}
        {isExpired && subscriptionEndsAt && (
          <ProjectLink
            href={'/settings/organization?tab=billing'}
            className={cn(
              'rounded p-2 row gap-2 hover:bg-def-200 text-red-600',
            )}
          >
            <BanknoteIcon size={20} />
            <div className="flex-1 col gap-0.5">
              <div className="font-medium">Subscription expired</div>
              <div className="text-sm opacity-80">
                You can still use OpenPanel but you won't have access to new
                incoming data.
              </div>
            </div>
          </ProjectLink>
        )}
        {isCanceled && subscriptionEndsAt && (
          <ProjectLink
            href={'/settings/organization?tab=billing'}
            className={cn(
              'rounded p-2 row gap-2 hover:bg-def-200 text-red-600',
            )}
          >
            <BanknoteIcon size={20} />
            <div className="flex-1 col gap-0.5">
              <div className="font-medium">Subscription canceled</div>
              <div className="text-sm opacity-80">
                {differenceInDays(new Date(), subscriptionEndsAt)} days ago
              </div>
            </div>
          </ProjectLink>
        )}
        {isExceeded && subscriptionEndsAt && (
          <ProjectLink
            href={'/settings/organization?tab=billing'}
            className={cn(
              'rounded p-2 row gap-2 hover:bg-def-200 text-destructive',
            )}
          >
            <BanknoteIcon size={20} />
            <div className="flex-1 col gap-0.5">
              <div className="font-medium">Events limit exceeded</div>
              <div className="text-sm opacity-80">
                {number.format(subscriptionPeriodEventsCount)} /{' '}
                {number.format(subscriptionPeriodEventsLimit)}
              </div>
            </div>
          </ProjectLink>
        )}
        <ProjectLink
          href={'/chat'}
          className={cn('rounded p-2 row gap-2 hover:bg-def-200 items-center')}
        >
          <SparklesIcon size={20} />
          <div className="flex-1 col gap-1">
            <div className="font-medium">Ask AI</div>
          </div>
          <CommandShortcut>⌘K</CommandShortcut>
        </ProjectLink>
        <ProjectLink
          href={'/reports'}
          className={cn('rounded p-2 row gap-2 hover:bg-def-200 items-center')}
        >
          <ChartLineIcon size={20} />
          <div className="flex-1 col gap-1">
            <div className="font-medium">Create report</div>
          </div>
          <CommandShortcut>⌘J</CommandShortcut>
        </ProjectLink>
      </div>
      <LinkWithIcon icon={WallpaperIcon} label="Overview" href={'/'} />
      <LinkWithIcon
        icon={LayoutPanelTopIcon}
        label="Dashboards"
        href={'/dashboards'}
      />
      <LinkWithIcon icon={LayersIcon} label="Pages" href={'/pages'} />
      <LinkWithIcon icon={Globe2Icon} label="Realtime" href={'/realtime'} />
      <LinkWithIcon icon={GanttChartIcon} label="Events" href={'/events'} />
      <LinkWithIcon icon={UsersIcon} label="Profiles" href={'/profiles'} />
      <LinkWithIcon icon={ScanEyeIcon} label="Retention" href={'/retention'} />
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
              href={`/dashboards/${item.id}`}
            />
          ))}
        </div>
      </div>
      {process.env.NEXT_PUBLIC_SELF_HOSTED === 'true' && (
        <div className="mt-auto w-full ">
          <div className={cn('text-sm w-full text-center')}>
            Self-hosted instance
          </div>
        </div>
      )}
    </>
  );
}
