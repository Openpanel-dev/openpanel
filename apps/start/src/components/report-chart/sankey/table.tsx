import { round } from '@openpanel/shared';
import { ArrowRightIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useReportChartContext } from '../context';
import {
  type ReportColumn,
  ReportDataTable,
  type ReportRowIdentity,
} from '@/components/report-table/report-data-table';

interface SankeyData {
  nodes: Array<{
    id: string;
    label: string;
    nodeColor: string;
    value?: number;
    step?: number;
  }>;
  links: Array<{ source: string; target: string; value: number }>;
}

interface PathRow {
  id: string;
  from: string;
  to: string;
  color: string;
  sessions: number;
  shareOfTotal: number;
  shareOfSource: number;
}

const IDENTITY: ReportRowIdentity<PathRow> = {
  header: 'Path',
  render: (row) => (
    <span className="flex items-center gap-1.5">
      <span className="truncate">{row.from}</span>
      <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{row.to}</span>
    </span>
  ),
  searchText: (row) => `${row.from} → ${row.to}`,
  color: (row) => row.color,
  width: 320,
};

const COLUMNS: ReportColumn<PathRow>[] = [
  {
    id: 'sessions',
    header: 'Sessions',
    value: (row) => row.sessions,
    decorate: 'bar',
    width: 150,
  },
  {
    id: 'shareOfTotal',
    header: '% of total',
    value: (row) => row.shareOfTotal,
    format: 'percent',
  },
  {
    id: 'shareOfSource',
    header: '% of source',
    value: (row) => row.shareOfSource,
    format: 'percent',
  },
];

/** Every link of the flow, ranked by sessions, with its share of all sessions and of its source node. */
export function PathsTable({ data }: { data: SankeyData }) {
  const {
    report: { name },
  } = useReportChartContext();

  const rows = useMemo(() => {
    const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
    const firstStep = data.nodes.filter((node) => node.step === 1);
    const total = (firstStep.length > 0 ? firstStep : data.nodes).reduce(
      (sum, node) => sum + (node.value ?? 0),
      0
    );
    return data.links
      .map((link): PathRow => {
        const source = nodeById.get(link.source);
        const target = nodeById.get(link.target);
        const sourceValue = source?.value ?? 0;
        return {
          id: `${link.source}→${link.target}`,
          from: source?.label ?? link.source,
          to: target?.label ?? link.target,
          color: source?.nodeColor ?? 'var(--chart-0)',
          sessions: link.value,
          shareOfTotal: total > 0 ? round((link.value / total) * 100, 1) : 0,
          shareOfSource:
            sourceValue > 0 ? round((link.value / sourceValue) * 100, 1) : 0,
        };
      })
      .sort((a, b) => b.sessions - a.sessions);
  }, [data]);

  return (
    <ReportDataTable
      columns={COLUMNS}
      csvFilename={name || 'paths'}
      getRowId={(row) => row.id}
      identity={IDENTITY}
      rows={rows}
    />
  );
}
