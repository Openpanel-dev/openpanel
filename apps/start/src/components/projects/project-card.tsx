import type { IServiceProject } from '@openpanel/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { SettingsIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { FadeIn } from '../fade-in';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Skeleton } from '../skeleton';
import { LinkButton } from '../ui/button';
import { ProjectChart } from './project-chart';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

export function ProjectCardRoot({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'card relative hover:-translate-y-px hover:shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <ProjectCardRoot className="col aspect-[340/116.25] p-4">
      <Skeleton className="h-5 w-full" />
      <div className="row mt-auto ml-auto w-1/2 gap-4">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
      </div>
    </ProjectCardRoot>
  );
}

function ProjectCard({ id, domain, name, organizationId }: IServiceProject) {
  return (
    <ProjectCardRoot>
      <Link
        className="col p-4 transition-transform"
        params={{
          organizationId,
          projectId: id,
        }}
        to="/$organizationId/$projectId"
      >
        <div className="flex items-center gap-2 pb-2 font-medium text-lg">
          <div className="row flex-1 gap-2">
            {domain && <SerieIcon name={domain ?? ''} />}
            {name}
          </div>
        </div>
        <div className="-mx-4 mb-4 aspect-[8/1]">
          <ProjectChartOuter id={id} />
        </div>
        <div className="flex h-9 flex-1 gap-4 md:h-4">
          <ProjectMetrics id={id} />
        </div>
      </Link>
      <LinkButton
        className="absolute top-2 right-2 text-muted-foreground"
        href={`/${organizationId}/${id}/settings`}
        variant="ghost"
      >
        <SettingsIcon size={16} />
      </LinkButton>
    </ProjectCardRoot>
  );
}

function ProjectChartOuter({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.chart.projectCard.queryOptions({
      projectId: id,
    })
  );

  return (
    <FadeIn className="h-full w-full">
      <ProjectChart color={'blue'} data={data?.chart || []} />
    </FadeIn>
  );
}

function Metric({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 text-sm md:flex-row',
        className
      )}
    >
      <div className="text-muted-foreground">{label}</div>
      <span className="whitespace-nowrap font-medium">{value}</span>
    </div>
  );
}

function ProjectMetrics({ id }: { id: string }) {
  const number = useNumber();
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.chart.projectCard.queryOptions({
      projectId: id,
    })
  );

  return (
    <FadeIn className="row flex-1 flex-wrap gap-3">
      {typeof data?.trend?.percentage === 'number' && (
        <Metric
          label="3M DIFF"
          value={
            <span
              className={cn(
                'font-semibold',
                'row items-center gap-1',
                data?.trend?.direction === 'up'
                  ? 'text-emerald-300'
                  : data?.trend?.direction === 'down'
                    ? 'text-orange-300'
                    : 'text-muted-foreground'
              )}
            >
              {data.trend.direction === 'up' && (
                <TrendingUpIcon className="size-4" />
              )}
              {data.trend.direction === 'down' && (
                <TrendingDownIcon className="size-4" />
              )}
              {Math.abs(data.trend.percentage)}%
            </span>
          }
        />
      )}
      {!!data?.metrics?.revenue && (
        <Metric
          label="Revenue"
          value={number.currency(data?.metrics?.revenue / 100, {
            short: true,
          })}
        />
      )}
      <Metric
        className="ml-auto"
        label="3M"
        value={number.short(data?.metrics?.months_3 ?? 0)}
      />
      <Metric label="30D" value={number.short(data?.metrics?.month ?? 0)} />
      <Metric label="24H" value={number.short(data?.metrics?.day ?? 0)} />
    </FadeIn>
  );
}

export default ProjectCard;
