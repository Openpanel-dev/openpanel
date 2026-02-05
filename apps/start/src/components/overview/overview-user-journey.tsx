import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import { ResponsiveSankey } from '@nivo/sankey';
import { parseAsInteger, useQueryState } from 'nuqs';
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { useTRPC } from '@/integrations/trpc/react';
import { truncate } from '@/utils/truncate';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon } from 'lucide-react';
import { useTheme } from '../theme-provider';
import { Widget, WidgetBody } from '../widget';
import { WidgetButtons, WidgetFooter, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewUserJourneyProps {
  projectId: string;
  shareId?: string;
}

type PortalTooltipPosition = { left: number; top: number; ready: boolean };

const showPath = (string: string) => {
  try {
    const url = new URL(string);
    return url.pathname;
  } catch {
    return string;
  }
};

const showDomain = (string: string) => {
  try {
    const url = new URL(string);
    return url.hostname;
  } catch {
    return string;
  }
};

function SankeyPortalTooltip({
  children,
  offset = 12,
  padding = 8,
}: {
  children: ReactNode;
  offset?: number;
  padding?: number;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<PortalTooltipPosition>({
    left: 0,
    top: 0,
    ready: false,
  });
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;

    // Nivo renders the tooltip content inside an absolutely-positioned wrapper <div>.
    // The wrapper is the immediate parent of our rendered content.
    const wrapper = el.parentElement;
    if (!wrapper) return;

    const update = () => {
      setAnchorRect(wrapper.getBoundingClientRect());
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(wrapper);

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    if (!anchorRect) return;
    const tooltipEl = tooltipRef.current;
    if (!tooltipEl) return;

    const rect = tooltipEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Start by following Nivo's tooltip anchor position.
    let left = anchorRect.left + offset;
    let top = anchorRect.top + offset;

    // Clamp inside viewport with a little padding.
    left = Math.min(
      Math.max(padding, left),
      Math.max(padding, vw - rect.width - padding),
    );
    top = Math.min(
      Math.max(padding, top),
      Math.max(padding, vh - rect.height - padding),
    );

    setPos({ left, top, ready: true });
  }, [mounted, anchorRect, children, offset, padding]);

  // SSR safety: on the server, just render the tooltip normally.
  if (typeof document === 'undefined') {
    return <>{children}</>;
  }

  return (
    <>
      {/* Render a tiny (screen-reader-only) anchor inside Nivo's tooltip wrapper. */}
      <span ref={anchorRef} className="sr-only" />
      {mounted &&
        createPortal(
          <div
            ref={tooltipRef}
            className="pointer-events-none fixed z-[9999]"
            style={{
              left: pos.left,
              top: pos.top,
              visibility: pos.ready ? 'visible' : 'hidden',
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

export default function OverviewUserJourney({
  projectId,
  shareId,
}: OverviewUserJourneyProps) {
  const { range, startDate, endDate } = useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const [steps, setSteps] = useQueryState(
    'journeySteps',
    parseAsInteger.withDefault(5).withOptions({ history: 'push' }),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const trpc = useTRPC();

  const query = useQuery(
    trpc.overview.userJourney.queryOptions({
      projectId,
      filters,
      startDate,
      endDate,
      range,
      steps: steps ?? 5,
      shareId,
    }),
  );

  const data = query.data;
  const number = useNumber();

  // Process data for Sankey - nodes are already sorted by step then value from backend
  const sankeyData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };

    return {
      nodes: data.nodes.map((node: any) => ({
        ...node,
        // Store label for display in tooltips
        label: node.label || node.id,
        data: {
          percentage: node.percentage,
          value: node.value,
          step: node.step,
          label: node.label || node.id,
        },
      })),
      links: data.links,
    };
  }, [data]);

  const totalSessions = useMemo(() => {
    if (!sankeyData.nodes || sankeyData.nodes.length === 0) return 0;
    // Total sessions used by backend for percentages is the sum of entry nodes (step 1).
    // Fall back to summing all nodes if step is missing for some reason.
    const step1 = sankeyData.nodes.filter((n: any) => n.data?.step === 1);
    const base = step1.length > 0 ? step1 : sankeyData.nodes;
    return base.reduce((sum: number, n: any) => sum + (n.data?.value ?? 0), 0);
  }, [sankeyData.nodes]);

  const stepOptions = [3, 5];

  const { appTheme } = useTheme();

  return (
    <Widget className="col-span-6">
      <WidgetHead>
        <div className="title">User Journey</div>
        <WidgetButtons>
          {stepOptions.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => setSteps(option)}
              className={cn((steps ?? 5) === option && 'active')}
            >
              {option} Steps
            </button>
          ))}
        </WidgetButtons>
      </WidgetHead>
      <WidgetBody>
        {query.isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        ) : sankeyData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-sm text-muted-foreground">
              No journey data available
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full relative aspect-square md:aspect-[2]"
          >
            <ResponsiveSankey
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              data={sankeyData}
              colors={(node: any) => node.nodeColor}
              nodeBorderRadius={2}
              animate={false}
              nodeBorderWidth={0}
              nodeOpacity={0.8}
              linkContract={1}
              linkOpacity={0.3}
              linkBlendMode={'normal'}
              nodeTooltip={({ node }: any) => {
                const label = node?.data?.label ?? node?.label ?? node?.id;
                const value = node?.data?.value ?? node?.value ?? 0;
                const step = node?.data?.step;
                const pct =
                  typeof node?.data?.percentage === 'number'
                    ? node.data.percentage
                    : totalSessions > 0
                      ? (value / totalSessions) * 100
                      : 0;
                const color =
                  node?.color ??
                  node?.data?.nodeColor ??
                  node?.data?.color ??
                  node?.nodeColor ??
                  '#64748b';

                return (
                  <SankeyPortalTooltip>
                    <ChartTooltipContainer className="min-w-[250px]">
                      <ChartTooltipHeader>
                        <div className="min-w-0 flex-1 font-medium break-words">
                          <span className="opacity-40 mr-1">
                            {showDomain(label)}
                          </span>
                          {showPath(label)}
                        </div>
                        {typeof step === 'number' && (
                          <div className="shrink-0 text-muted-foreground">
                            Step {step}
                          </div>
                        )}
                      </ChartTooltipHeader>
                      <ChartTooltipItem color={color} innerClassName="gap-2">
                        <div className="flex items-center justify-between gap-8 font-mono font-medium">
                          <div className="text-muted-foreground">Sessions</div>
                          <div>{number.format(value)}</div>
                        </div>
                        <div className="flex items-center justify-between gap-8 font-mono font-medium">
                          <div className="text-muted-foreground">Share</div>
                          <div>{number.format(round(pct, 1))} %</div>
                        </div>
                      </ChartTooltipItem>
                    </ChartTooltipContainer>
                  </SankeyPortalTooltip>
                );
              }}
              linkTooltip={({ link }: any) => {
                const sourceLabel =
                  link?.source?.data?.label ??
                  link?.source?.label ??
                  link?.source?.id;
                const targetLabel =
                  link?.target?.data?.label ??
                  link?.target?.label ??
                  link?.target?.id;

                const value = link?.value ?? 0;
                const sourceValue =
                  link?.source?.data?.value ?? link?.source?.value ?? 0;

                const pctOfTotal =
                  totalSessions > 0 ? (value / totalSessions) * 100 : 0;
                const pctOfSource =
                  sourceValue > 0 ? (value / sourceValue) * 100 : 0;

                const sourceStep = link?.source?.data?.step;
                const targetStep = link?.target?.data?.step;

                const color =
                  link?.color ??
                  link?.source?.color ??
                  link?.source?.data?.nodeColor ??
                  '#64748b';

                const sourceDomain = showDomain(sourceLabel);
                const targetDomain = showDomain(targetLabel);
                const isSameDomain = sourceDomain === targetDomain;

                return (
                  <SankeyPortalTooltip>
                    <ChartTooltipContainer>
                      <ChartTooltipHeader>
                        <div className="min-w-0 flex-1 font-medium break-words">
                          <span className="opacity-40 mr-1">
                            {showDomain(sourceLabel)}
                          </span>
                          {showPath(sourceLabel)}
                          <ArrowRightIcon className="size-2 inline-block mx-3" />
                          {!isSameDomain && (
                            <span className="opacity-40 mr-1">
                              {showDomain(targetLabel)}
                            </span>
                          )}
                          {showPath(targetLabel)}
                        </div>
                        {typeof sourceStep === 'number' &&
                          typeof targetStep === 'number' && (
                            <div className="shrink-0 text-muted-foreground">
                              {sourceStep} → {targetStep}
                            </div>
                          )}
                      </ChartTooltipHeader>

                      <ChartTooltipItem color={color} innerClassName="gap-2">
                        <div className="flex items-center justify-between gap-8 font-mono font-medium">
                          <div className="text-muted-foreground">Sessions</div>
                          <div>{number.format(value)}</div>
                        </div>
                        <div className="flex items-center justify-between gap-8 font-mono text-sm">
                          <div className="text-muted-foreground">
                            % of total
                          </div>
                          <div>{number.format(round(pctOfTotal, 1))} %</div>
                        </div>
                        <div className="flex items-center justify-between gap-8 font-mono text-sm">
                          <div className="text-muted-foreground">
                            % of source
                          </div>
                          <div>{number.format(round(pctOfSource, 1))} %</div>
                        </div>
                      </ChartTooltipItem>
                    </ChartTooltipContainer>
                  </SankeyPortalTooltip>
                );
              }}
              label={(node: any) => {
                const label = showPath(
                  node.data?.label || node.label || node.id,
                );
                return truncate(label, 30, 'middle');
              }}
              labelTextColor={appTheme === 'dark' ? '#e2e8f0' : '#0f172a'}
              nodeSpacing={10}
            />
          </div>
        )}
      </WidgetBody>
      <WidgetFooter>
        <div className="text-xs text-muted-foreground">
          Shows the most common paths users take through your application
        </div>
      </WidgetFooter>
    </Widget>
  );
}
