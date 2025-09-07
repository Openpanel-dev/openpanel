import { shortNumber } from '@/hooks/useNumerFormatter';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import type { IServiceProject } from '@openpanel/db';

import { cn } from '@/utils/cn';
import { SettingsIcon } from 'lucide-react';
import { ChartSSR } from '../chart-ssr';
import { FadeIn } from '../fade-in';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Skeleton } from '../skeleton';
import { LinkButton } from '../ui/button';

export function ProjectCardRoot({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative card hover:-translate-y-px hover:shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <ProjectCardRoot className="aspect-[340/116.25] p-4 col">
      <Skeleton className="h-5 w-full" />
      <div className="row mt-auto gap-4 w-1/2 ml-auto">
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
        to="/$organizationId/$projectId"
        params={{
          organizationId,
          projectId: id,
        }}
        className="col p-4 transition-transform"
      >
        <div className="font-medium flex items-center gap-2 text-lg pb-2">
          <div className="row gap-2 flex-1">
            {domain && <SerieIcon name={domain ?? ''} />}
            {name}
          </div>
        </div>
        <div className="-mx-4 aspect-[8/1]">
          <ProjectChart id={id} />
        </div>
        <div className="flex justify-end gap-4 h-9 md:h-4">
          <ProjectMetrics id={id} />
        </div>
      </Link>
      <LinkButton
        variant="ghost"
        href={`/${organizationId}/${id}/settings/projects`}
        className="text-muted-foreground absolute top-2 right-2"
      >
        <SettingsIcon size={16} />
      </LinkButton>
    </ProjectCardRoot>
  );
}

function ProjectChart({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.chart.projectCard.queryOptions({
      projectId: id,
    }),
  );

  return (
    <FadeIn className="h-full w-full">
      <ChartSSR data={data?.chart || []} />
    </FadeIn>
  );
}

function Metric({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row">
      <div className="text-muted-foreground">{label}</div>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ProjectMetrics({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.chart.projectCard.queryOptions({
      projectId: id,
    }),
  );

  return (
    <FadeIn className="flex gap-4">
      <Metric
        label="3 months"
        value={shortNumber('en')(data?.metrics?.months_3)}
      />
      <Metric label="Month" value={shortNumber('en')(data?.metrics?.month)} />
      <Metric label="24h" value={shortNumber('en')(data?.metrics?.day)} />
    </FadeIn>
  );
}

export default ProjectCard;
