import { shortNumber } from '@/hooks/useNumerFormatter';
import { Suspense } from 'react';
import { escape } from 'sqlstring';

import type { IServiceProject } from '@openpanel/db';
import { TABLE_NAMES, chQuery } from '@openpanel/db';

import { SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { ChartSSR } from '../chart-ssr';
import { FadeIn } from '../fade-in';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { LinkButton } from '../ui/button';

function ProjectCard({ id, domain, name, organizationId }: IServiceProject) {
  // For some unknown reason I get when navigating back to this page when using <Link />
  // Should be solved: https://github.com/vercel/next.js/issues/61336
  // But still get the error
  return (
    <div className="relative card hover:-translate-y-px hover:shadow-sm">
      <a
        href={`/${organizationId}/${id}`}
        className="col p-4 transition-transform"
      >
        <div className="font-medium flex items-center gap-2 text-lg pb-2">
          <div className="row gap-2 flex-1">
            {domain && <SerieIcon name={domain ?? ''} />}
            {name}
          </div>
        </div>
        <div className="-mx-4 aspect-[8/1]">
          <Suspense>
            <ProjectChart id={id} />
          </Suspense>
        </div>
        <div className="flex justify-end gap-4 h-9 md:h-4">
          <Suspense>
            <ProjectMetrics id={id} />
          </Suspense>
        </div>
      </a>
      <LinkButton
        variant="ghost"
        href={`/${organizationId}/${id}/settings/projects`}
        className="text-muted-foreground absolute top-2 right-2"
      >
        <SettingsIcon size={16} />
      </LinkButton>
    </div>
  );
}

async function ProjectChart({ id }: { id: string }) {
  const chart = await chQuery<{ value: number; date: string }>(
    `SELECT
          uniqHLL12(profile_id) as value,
          toStartOfDay(created_at) as date
      FROM ${TABLE_NAMES.sessions}
      WHERE 
          sign = 1 AND 
          project_id = ${escape(id)} AND 
          created_at >= now() - interval '1 month'
      GROUP BY date
      ORDER BY date ASC
      WITH FILL FROM toStartOfDay(now() - interval '1 month') 
      TO toStartOfDay(now()) 
      STEP INTERVAL 1 day
    `,
  );

  return (
    <FadeIn className="h-full w-full">
      <ChartSSR data={chart.map((d) => ({ ...d, date: new Date(d.date) }))} />
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

async function ProjectMetrics({ id }: { id: string }) {
  const [metrics] = await chQuery<{
    months_3: number;
    month: number;
    day: number;
  }>(
    `
      SELECT
    uniqHLL12(if(created_at >= (now() - toIntervalMonth(6)), profile_id, null)) AS months_3,
    uniqHLL12(if(created_at >= (now() - toIntervalMonth(1)), profile_id, null)) AS month,
    uniqHLL12(if(created_at >= (now() - toIntervalDay(1)), profile_id, null)) AS day
FROM sessions
WHERE 
    project_id = ${escape(id)} AND 
    created_at >= (now() - toIntervalMonth(6))
    `,
  );

  return (
    <FadeIn className="flex gap-4">
      <Metric label="3 months" value={shortNumber('en')(metrics?.months_3)} />
      <Metric label="Month" value={shortNumber('en')(metrics?.month)} />
      <Metric label="24h" value={shortNumber('en')(metrics?.day)} />
    </FadeIn>
  );
}

export default ProjectCard;
