import {
  ChevronDownIcon,
  FilterIcon,
  GripVerticalIcon,
  Share2Icon,
} from 'lucide-react';
import { Pill } from './primitives';
import { cn } from '@/lib/utils';

// The report editor as the dashboard shows it: name and chart type on top,
// the "Report builder" (Metrics, Breakdown, Settings) on the left, the chart
// and its table on the right. Funnel, conversion and retention build on it.

export function BuilderSection({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="col gap-2">
      <div className="row items-center justify-between">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

export function SeriesRow({
  letter,
  name,
  filters,
  label,
}: {
  letter: string;
  name: string;
  filters?: string;
  label?: string;
}) {
  return (
    <div className="col gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11.5px]">
      <div className="row items-center gap-2">
        <GripVerticalIcon className="size-3 text-neutral-300" />
        <span className="center-center size-4 rounded bg-neutral-900 font-mono text-[9px] text-white">
          {letter}
        </span>
        <span className="truncate font-mono">{name}</span>
        <FilterIcon
          className={cn(
            'ml-auto size-3',
            filters ? 'text-blue-600' : 'text-neutral-300'
          )}
        />
      </div>
      {filters && (
        <span className="truncate pl-8 text-[10.5px] text-neutral-500">
          {filters}
        </span>
      )}
      {label && (
        <span className="truncate pl-8 text-[10.5px] text-neutral-500">
          {label}
        </span>
      )}
    </div>
  );
}

export function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row items-center justify-between gap-2 text-[11.5px]">
      <span className="whitespace-nowrap text-neutral-600">{label}</span>
      {children}
    </div>
  );
}

// A saved report as the dashboard shows it: name, chart type, the builder on
// the left and the chart with its table on the right.
export function ReportFrame({
  name,
  type,
  range = 'Last 30 days',
  builder,
  children,
}: {
  name: string;
  type: string;
  range?: string;
  builder: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="col gap-3">
      <div className="row items-center gap-2">
        <span className="font-medium text-[14px]">{name}</span>
        <span className="text-[11px] text-neutral-500">{range}</span>
        <span className="flex-1" />
        <Pill>
          {type}
          <ChevronDownIcon className="size-3 text-neutral-400" />
        </Pill>
        <Pill>
          <Share2Icon className="size-3" />
          Share
        </Pill>
        <Pill active>Save</Pill>
      </div>
      <div className="grid @3xl:grid-cols-[210px_minmax(0,1fr)] grid-cols-1 gap-3">
        <div className="col gap-4 rounded-lg border border-neutral-200 bg-white p-3">
          <span className="font-medium text-[12px]">Report builder</span>
          {builder}
        </div>
        <div className="col min-w-0 gap-3">{children}</div>
      </div>
    </div>
  );
}
