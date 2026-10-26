import { ChartLineIcon } from 'lucide-react';
import type { ReportDraft } from './ai-report-draft';
import { ProjectLink } from '@/components/links';
import { cn } from '@/utils/cn';

/** Opens the report editor prefilled with `draft`, so the chart can be saved, shared or alerted on. */
export function OpenAsReportLink({
  draft,
  className,
}: {
  draft: ReportDraft | null;
  className?: string;
}) {
  if (!draft) {
    return null;
  }
  return (
    <ProjectLink
      className={cn(
        'row h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-def-200 hover:text-foreground',
        className
      )}
      search={{ draft }}
      to="/reports"
    >
      <ChartLineIcon className="size-3.5" />
      Open as report
    </ProjectLink>
  );
}
