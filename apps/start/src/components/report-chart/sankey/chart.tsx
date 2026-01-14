import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
import { useNumber } from '@/hooks/use-numer-formatter';
import { round } from '@/utils/math';
import { ResponsiveSankey } from '@nivo/sankey';
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { useTheme } from '@/components/theme-provider';
import { truncate } from '@/utils/truncate';
import { ArrowRightIcon } from 'lucide-react';
import { AspectContainer } from '../aspect-container';

type PortalTooltipPosition = { left: number; top: number; ready: boolean };

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

    let left = anchorRect.left + offset;
    let top = anchorRect.top + offset;

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

  if (typeof document === 'undefined') {
    return <>{children}</>;
  }

  return (
    <>
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

type SankeyData = {
  nodes: Array<{
    id: string;
    label: string;
    nodeColor: string;
    percentage?: number;
    value?: number;
    step?: number;
  }>;
  links: Array<{ source: string; target: string; value: number }>;
};

export function Chart({ data }: { data: SankeyData }) {
  const number = useNumber();
  const containerRef = useRef<HTMLDivElement>(null);
  const { appTheme } = useTheme();

  // Process data for Sankey
  const sankeyData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };

    return {
      nodes: data.nodes.map((node) => ({
        ...node,
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
    const step1 = sankeyData.nodes.filter((n: any) => n.data?.step === 1);
    const base = step1.length > 0 ? step1 : sankeyData.nodes;
    return base.reduce((sum: number, n: any) => sum + (n.data?.value ?? 0), 0);
  }, [sankeyData.nodes]);

  return (
    <AspectContainer>
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
                      {label}
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

            return (
              <SankeyPortalTooltip>
                <ChartTooltipContainer>
                  <ChartTooltipHeader>
                    <div className="min-w-0 flex-1 font-medium break-words">
                      {sourceLabel}
                      <ArrowRightIcon className="size-2 inline-block mx-3" />
                      {targetLabel}
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
                      <div className="text-muted-foreground">% of total</div>
                      <div>{number.format(round(pctOfTotal, 1))} %</div>
                    </div>
                    <div className="flex items-center justify-between gap-8 font-mono text-sm">
                      <div className="text-muted-foreground">% of source</div>
                      <div>{number.format(round(pctOfSource, 1))} %</div>
                    </div>
                  </ChartTooltipItem>
                </ChartTooltipContainer>
              </SankeyPortalTooltip>
            );
          }}
          label={(node: any) => {
            const label = node.data?.label || node.label || node.id;
            return truncate(label, 30, 'middle');
          }}
          labelTextColor={appTheme === 'dark' ? '#e2e8f0' : '#0f172a'}
          nodeSpacing={10}
        />
      </div>
    </AspectContainer>
  );
}
