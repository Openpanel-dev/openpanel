import { round } from '@openpanel/shared';
import { ArrowRightIcon } from 'lucide-react';
import { useMemo } from 'react';
import { AspectContainer } from '../aspect-container';
import { OPTooltipCard } from '@/components/charts/op-tooltip';
import {
  SankeyChart,
  SankeyLink,
  SankeyNode,
  SankeyTooltip,
} from '@/components/charts/sankey';
import { useElementSize } from '@/hooks/use-element-size';
import { useNumber } from '@/hooks/use-numer-formatter';
import { getChartColor } from '@/utils/theme';
import { truncate } from '@/utils/truncate';

// Roughly one character of the 12px label font, to fit labels in their margin.
const LABEL_CHAR_WIDTH = 7;
const LABEL_SHARE = 0.2;
const LABEL_MAX_WIDTH = 170;
const VERTICAL_MARGIN = 24;
const NODE_WIDTH = 12;
const NODE_PADDING = 28;
const NODE_RADIUS = 4;
const LINK_GAP = 2;
const LINK_OPACITY = 0.45;
// Where a session starts or ends is context, not a step: drawn muted so the
// flow between real events stands out.
const SESSION_BOUNDARIES = new Set(['session_start', 'session_end']);
const BOUNDARY_COLOR = 'var(--def-300)';

interface ReportSankeyData {
  nodes: Array<{
    id: string;
    label: string;
    nodeColor: string;
    percentage?: number;
    value?: number;
    step?: number;
  }>;
  links: Array<{ source: string; target: string; value: number }>;
}

interface SankeyNodeInfo {
  [key: string]: unknown;
  name: string;
  category?: 'source';
  label: string;
  color: string;
  step?: number;
}

export function Chart({ data }: { data: ReportSankeyData }) {
  const number = useNumber();
  const [sizeRef, size] = useElementSize();

  const labelWidth = Math.min(size.width * LABEL_SHARE, LABEL_MAX_WIDTH);
  const labelLength = Math.floor(labelWidth / LABEL_CHAR_WIDTH);

  const sankeyData = useMemo(() => {
    const indexById = new Map(
      data.nodes.map((node, index) => [node.id, index])
    );
    const targets = new Set(data.links.map((link) => link.target));
    const colorByLabel = new Map<string, string>();
    for (const node of data.nodes) {
      const label = node.label || node.id;
      if (!(SESSION_BOUNDARIES.has(label) || colorByLabel.has(label))) {
        colorByLabel.set(label, getChartColor(colorByLabel.size));
      }
    }
    return {
      nodes: data.nodes.map(
        (node): SankeyNodeInfo => ({
          name: truncate(node.label || node.id, labelLength, 'middle'),
          // bklit counts a source by its outgoing flow, every other node by its incoming flow.
          category: targets.has(node.id) ? undefined : 'source',
          label: node.label || node.id,
          color: colorByLabel.get(node.label || node.id) ?? BOUNDARY_COLOR,
          step: node.step,
        })
      ),
      links: data.links.flatMap((link) => {
        const source = indexById.get(link.source);
        const target = indexById.get(link.target);
        if (source === undefined || target === undefined) {
          return [];
        }
        return [{ source, target, value: link.value }];
      }),
    };
  }, [data, labelLength]);

  // Share of the sessions that start the flow, so link and node shares add up per step.
  const totalSessions = useMemo(() => {
    const firstStep = data.nodes.filter((node) => node.step === 1);
    const base = firstStep.length > 0 ? firstStep : data.nodes;
    return base.reduce((sum, node) => sum + (node.value ?? 0), 0);
  }, [data.nodes]);
  const shareOfTotal = (value: number) =>
    totalSessions > 0 ? round((value / totalSessions) * 100, 1) : 0;

  const nodeColor = (node: { name?: string; color?: unknown }) =>
    typeof node.color === 'string' ? node.color : 'var(--chart-0)';

  return (
    <AspectContainer>
      <div
        className="relative h-full w-full"
        data-report-chart="sankey"
        ref={sizeRef}
      >
        {size.width > 0 && (
          <SankeyChart
            animationDuration={0}
            aspectRatio="auto"
            className="h-full"
            data={sankeyData}
            margin={{
              top: VERTICAL_MARGIN,
              bottom: VERTICAL_MARGIN,
              left: labelWidth,
              right: labelWidth,
            }}
            nodePadding={NODE_PADDING}
            nodeWidth={NODE_WIDTH}
          >
            <SankeyLink
              getNodeColor={nodeColor}
              linkGap={LINK_GAP}
              strokeOpacity={LINK_OPACITY}
            />
            <SankeyNode getNodeColor={nodeColor} lineCap={NODE_RADIUS} />
            <SankeyTooltip
              linkContent={({ link }) => {
                const source = link.source as unknown as SankeyNodeInfo & {
                  value?: number;
                };
                const target = link.target as unknown as SankeyNodeInfo;
                const sourceValue = source.value ?? 0;
                return (
                  <OPTooltipCard className="min-w-[220px]">
                    <div className="font-medium">
                      {source.label}
                      <ArrowRightIcon className="mx-2 inline-block size-3" />
                      {target.label}
                    </div>
                    <TooltipStats
                      color={nodeColor(source)}
                      rows={[
                        ['Sessions', number.format(link.value)],
                        ['% of total', `${shareOfTotal(link.value)} %`],
                        [
                          '% of source',
                          `${sourceValue > 0 ? round((link.value / sourceValue) * 100, 1) : 0} %`,
                        ],
                      ]}
                    />
                  </OPTooltipCard>
                );
              }}
              nodeContent={({ node }) => {
                const info = node as unknown as SankeyNodeInfo & {
                  value?: number;
                };
                const value = info.value ?? 0;
                return (
                  <OPTooltipCard className="min-w-[220px]">
                    <div className="flex justify-between gap-4">
                      <span className="font-medium">{info.label}</span>
                      {info.step !== undefined && (
                        <span className="shrink-0 text-muted-foreground">
                          Step {info.step}
                        </span>
                      )}
                    </div>
                    <TooltipStats
                      color={nodeColor(info)}
                      rows={[
                        ['Sessions', number.format(value)],
                        ['Share', `${shareOfTotal(value)} %`],
                      ]}
                    />
                  </OPTooltipCard>
                );
              }}
            />
          </SankeyChart>
        )}
      </div>
    </AspectContainer>
  );
}

function TooltipStats({
  color,
  rows,
}: {
  color: string;
  rows: [label: string, value: string][];
}) {
  return (
    <div className="flex gap-2">
      <div className="w-[3px] rounded-full" style={{ background: color }} />
      <div className="col flex-1 gap-1 font-mono text-sm">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-8" key={label}>
            <span className="text-muted-foreground">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
