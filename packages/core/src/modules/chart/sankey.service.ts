import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import { TRPCBadRequestError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import { getSettingsForProject } from '../organization/organization.service';
import {
  chartColors,
  type IChartEvent,
  type IChartEventFilter,
} from '../report/report.constants';
import {
  DEFAULT_SANKEY_STEPS,
  type IGetSankeyInput,
  MAX_SANKEY_WINDOW_DAYS,
} from './chart.constants';
import { convertClickhouseDateToJs } from './src/dates';
import {
  getEventFiltersWhereClause,
  joinFilterClauses,
} from './src/filter-where';
import { runQuery } from './src/run-query';
import {
  type SankeyEvent,
  type SankeyPathsInput,
  sankeyBetweenTopEntriesQuery,
  sankeyBetweenTransitionsQuery,
  sankeyTopEntriesQuery,
  sankeyTransitionsQuery,
} from './src/sankey.sql';

/** Destinations kept per node when the flow branches. */
const TOP_DESTINATIONS_PER_NODE = 3;
const MILLISECONDS_PER_DAY = 86_400_000;
/** Links carrying less than this share of the entry sessions are dropped. */
const MIN_LINK_PERCENT = 0.25;
const PERCENT = 100;
const FIRST_STEP = 1;

export { type IGetSankeyInput, zGetSankeyInput } from './chart.constants';

export interface SankeyNode {
  id: string;
  label: string;
  nodeColor: string;
  percentage?: number;
  value?: number;
  step?: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyResult {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

/** Every node the builder emits carries all three; the public type keeps them optional for other callers. */
type ResolvedSankeyNode = SankeyNode & {
  percentage: number;
  value: number;
  step: number;
};

interface Transition {
  source: string;
  target: string;
  step: number;
  value: number;
}

interface TopEntry {
  entry_event: string;
  count: number;
}

/**
 * The sessions table names the first page `entry_path` / `entry_origin` and
 * flattens `properties.__query.utm_*` into `utm_*` columns, so a filter
 * written against the events vocabulary has to be renamed before it compiles
 * for that table.
 */
export function getRawWhereClause(
  type: 'events' | 'sessions',
  filters: IChartEventFilter[],
  projectId?: string
): SqlFragment | null {
  const where = getEventFiltersWhereClause(
    filters.map((filter) => {
      if (type !== 'sessions') {
        return filter;
      }
      if (filter.name === 'path') {
        return { ...filter, name: 'entry_path' };
      }
      if (filter.name === 'origin') {
        return { ...filter, name: 'entry_origin' };
      }
      if (filter.name.startsWith('properties.__query.utm_')) {
        return {
          ...filter,
          name: filter.name.replace('properties.__query.utm_', 'utm_'),
        };
      }
      return filter;
    }),
    projectId
  );

  return joinFilterClauses(where);
}

function toSankeyEvent(
  event: IChartEvent | undefined,
  projectId: string
): SankeyEvent | undefined {
  return event
    ? {
        name: event.name,
        whereClause: getRawWhereClause('events', event.filters, projectId),
      }
    : undefined;
}

/**
 * Refuses a `chart.sankey` window wider than MAX_SANKEY_WINDOW_DAYS.
 *
 * Refused rather than shortened: a flow computed over a narrower range than the
 * one asked for is a different diagram, and nothing in the rendered result says
 * so. An unparseable date is left alone — the statement itself is where a
 * malformed range is rejected.
 *
 * Applied by `getSankeyChart` (the `chart.sankey` entry point) and not by
 * `getSankey`: the REST `/insights/:projectId/user_flow` route, the MCP
 * `get_user_flow` tool and the assistant tool take caller-supplied dates and
 * are not covered by the range picker's cap.
 */
export function assertSankeyWindowIsAnswerable(
  startDate: string,
  endDate: string
): void {
  const start = convertClickhouseDateToJs(startDate).getTime();
  const end = convertClickhouseDateToJs(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return;
  }

  const windowDays = Math.floor((end - start) / MILLISECONDS_PER_DAY);
  if (windowDays > MAX_SANKEY_WINDOW_DAYS) {
    throw new TRPCBadRequestError(
      `User flow can cover at most ${MAX_SANKEY_WINDOW_DAYS} days and the selected range covers ${windowDays}. Pick a shorter range — "Last 3 months" is the longest one supported.`
    );
  }
}

export async function getSankey(
  deps: ServiceDeps,
  {
    projectId,
    startDate,
    endDate,
    steps = DEFAULT_SANKEY_STEPS,
    mode,
    startEvent,
    endEvent,
    exclude = [],
    include,
    timezone,
  }: IGetSankeyInput
): Promise<SankeyResult> {
  const colors = chartColors.map((color) => color.main);
  const pathsInput: SankeyPathsInput = {
    projectId,
    startDate,
    endDate,
    steps,
    mode,
    startEvent: toSankeyEvent(startEvent, projectId),
    endEvent: toSankeyEvent(endEvent, projectId),
    include,
    exclude,
  };
  const isBetween = mode === 'between' && !!startEvent && !!endEvent;
  const start = pathsInput.startEvent as SankeyEvent;
  const end = pathsInput.endEvent as SankeyEvent;

  const topEntries = await runQuery<TopEntry>(
    deps,
    isBetween
      ? sankeyBetweenTopEntriesQuery(pathsInput, start, end)
      : sankeyTopEntriesQuery(pathsInput),
    timezone
  );

  if (topEntries.length === 0) {
    return { nodes: [], links: [] };
  }

  const topEntryEvents = topEntries.map((entry) => entry.entry_event);
  const totalSessions = topEntries.reduce((sum, entry) => sum + entry.count, 0);

  const transitions = await runQuery<Transition>(
    deps,
    isBetween
      ? sankeyBetweenTransitionsQuery(pathsInput, start, end, topEntryEvents)
      : sankeyTransitionsQuery(pathsInput, topEntryEvents),
    timezone
  );

  return buildSankeyFromTransitions(
    transitions,
    topEntries,
    totalSessions,
    steps,
    colors
  );
}

interface NodeData {
  event: string;
  value: number;
  step: number;
  color: string;
}

/** Node ids are per-step so a repeated event does not collapse the flow. */
function getNodeId(event: string, step: number) {
  return `${event}::step${step}`;
}

function groupTransitionsByStep(transitions: Transition[]) {
  const byStep = new Map<number, Transition[]>();
  for (const transition of transitions) {
    const bucket = byStep.get(transition.step);
    if (bucket) {
      bucket.push(transition);
    } else {
      byStep.set(transition.step, [transition]);
    }
  }
  return byStep;
}

/** Walks the flow step by step, keeping the top destinations of each node. */
function expandFlow(
  transitions: Transition[],
  topEntries: TopEntry[],
  steps: number,
  colors: string[]
): { nodes: Map<string, NodeData>; links: SankeyLink[] } {
  const nodes = new Map<string, NodeData>();
  const links: SankeyLink[] = [];
  const transitionsByStep = groupTransitionsByStep(transitions);

  const activeNodes = new Map<string, string>();
  topEntries.forEach((entry, index) => {
    const nodeId = getNodeId(entry.entry_event, FIRST_STEP);
    nodes.set(nodeId, {
      event: entry.entry_event,
      value: entry.count,
      step: FIRST_STEP,
      color: colors[index % colors.length] as string,
    });
    activeNodes.set(entry.entry_event, nodeId);
  });

  for (let step = FIRST_STEP; step < steps; step++) {
    const stepTransitions = transitionsByStep.get(step) || [];
    const nextActiveNodes = new Map<string, string>();

    for (const [sourceEvent, sourceNodeId] of activeNodes) {
      const fromSource = stepTransitions
        .filter((transition) => transition.source === sourceEvent)
        .sort((a, b) => b.value - a.value)
        .slice(0, TOP_DESTINATIONS_PER_NODE);

      for (const transition of fromSource) {
        if (transition.source === transition.target) {
          continue;
        }
        const targetNodeId = getNodeId(transition.target, step + 1);
        links.push({
          source: sourceNodeId,
          target: targetNodeId,
          value: transition.value,
        });

        const existing = nodes.get(targetNodeId);
        if (existing) {
          existing.value += transition.value;
        } else {
          nodes.set(targetNodeId, {
            event: transition.target,
            value: transition.value,
            step: step + 1,
            color:
              nodes.get(sourceNodeId)?.color ||
              (colors[nodes.size % colors.length] as string),
          });
        }
        nextActiveNodes.set(transition.target, targetNodeId);
      }
    }

    activeNodes.clear();
    for (const [event, nodeId] of nextActiveNodes) {
      activeNodes.set(event, nodeId);
    }
    if (activeNodes.size === 0) {
      break;
    }
  }

  return { nodes, links };
}

/** Merges the terminal nodes that carry the same event name into one. */
function mergeFinalNodes(
  finalNodes: ResolvedSankeyNode[],
  validLinks: SankeyLink[],
  totalSessions: number
): SankeyResult {
  const nodesWithOutgoing = new Set(validLinks.map((link) => link.source));
  const finalNodeIds = new Set(
    finalNodes
      .filter((node) => !nodesWithOutgoing.has(node.id))
      .map((node) => node.id)
  );

  const finalNodesByEvent = new Map<string, ResolvedSankeyNode[]>();
  for (const node of finalNodes) {
    if (finalNodeIds.has(node.id)) {
      const bucket = finalNodesByEvent.get(node.label);
      if (bucket) {
        bucket.push(node);
      } else {
        finalNodesByEvent.set(node.label, [node]);
      }
    }
  }

  const nodeIdRemap = new Map<string, string>();
  const mergedNodes = new Map<string, ResolvedSankeyNode>();
  finalNodesByEvent.forEach((nodesToMerge, eventName) => {
    if (nodesToMerge.length <= 1) {
      return;
    }
    const maxStep = Math.max(...nodesToMerge.map((node) => node.step || 0));
    const totalValue = nodesToMerge.reduce(
      (sum, node) => sum + (node.value || 0),
      0
    );
    const mergedNodeId = `${eventName}::final`;
    const firstNode = nodesToMerge[0] as ResolvedSankeyNode;
    mergedNodes.set(mergedNodeId, {
      id: mergedNodeId,
      label: eventName,
      nodeColor: firstNode.nodeColor,
      percentage: (totalValue / totalSessions) * PERCENT,
      value: totalValue,
      step: maxStep,
    });
    for (const node of nodesToMerge) {
      nodeIdRemap.set(node.id, mergedNodeId);
    }
  });

  const remappedLinks = validLinks.map((link) => ({
    source: nodeIdRemap.get(link.source) || link.source,
    target: nodeIdRemap.get(link.target) || link.target,
    value: link.value,
  }));

  const mergedOldNodeIds = new Set(nodeIdRemap.keys());
  const remainingNodes = finalNodes.filter(
    (node) => !(finalNodeIds.has(node.id) || mergedOldNodeIds.has(node.id))
  );
  const allNodes = [...remainingNodes, ...mergedNodes.values()].sort((a, b) => {
    if (a.step !== b.step) {
      return a.step - b.step;
    }
    return b.value - a.value;
  });

  // Links can point at the same merged target; sum them.
  const linkMap = new Map<string, number>();
  for (const link of remappedLinks) {
    const key = `${link.source}->${link.target}`;
    linkMap.set(key, (linkMap.get(key) || 0) + link.value);
  }

  const nodeIds = new Set(allNodes.map((node) => node.id));
  const links: SankeyLink[] = [];
  for (const [key, value] of linkMap) {
    const parts = key.split('->');
    if (parts.length !== 2) {
      continue;
    }
    const source = parts[0] as string;
    const target = parts[1] as string;
    if (nodeIds.has(source) && nodeIds.has(target)) {
      links.push({ source, target, value });
    }
  }

  return { nodes: allNodes, links };
}

function buildSankeyFromTransitions(
  transitions: Transition[],
  topEntries: TopEntry[],
  totalSessions: number,
  steps: number,
  colors: string[]
): SankeyResult {
  if (transitions.length === 0) {
    return { nodes: [], links: [] };
  }

  const { nodes, links } = expandFlow(transitions, topEntries, steps, colors);

  const minLinkValue = Math.ceil((totalSessions * MIN_LINK_PERCENT) / PERCENT);
  const filteredLinks = links.filter((link) => link.value >= minLinkValue);

  const referencedNodeIds = new Set<string>();
  for (const link of filteredLinks) {
    referencedNodeIds.add(link.source);
    referencedNodeIds.add(link.target);
  }

  const nodeValuesFromLinks = new Map<string, number>();
  for (const link of filteredLinks) {
    nodeValuesFromLinks.set(
      link.target,
      (nodeValuesFromLinks.get(link.target) || 0) + link.value
    );
  }

  // An entry node only survives if it still has an outgoing link.
  nodes.forEach((nodeData, nodeId) => {
    if (
      nodeData.step === FIRST_STEP &&
      !filteredLinks.some((link) => link.source === nodeId)
    ) {
      referencedNodeIds.delete(nodeId);
    }
  });

  const finalNodes: ResolvedSankeyNode[] = Array.from(nodes.entries())
    .filter(([id]) => referencedNodeIds.has(id))
    .map(([id, data]) => {
      const value =
        data.step === FIRST_STEP
          ? data.value
          : nodeValuesFromLinks.get(id) || data.value;
      return {
        id,
        label: data.event,
        nodeColor: data.color,
        percentage: (value / totalSessions) * PERCENT,
        value,
        step: data.step,
      };
    })
    .sort((a, b) => {
      if (a.step !== b.step) {
        return a.step - b.step;
      }
      return b.value - a.value;
    });

  const nodeIds = new Set(finalNodes.map((node) => node.id));
  const validLinks = filteredLinks.filter(
    (link) => nodeIds.has(link.source) && nodeIds.has(link.target)
  );

  return mergeFinalNodes(finalNodes, validLinks, totalSessions);
}

function toChartEvent(name: string) {
  return {
    id: name,
    name,
    displayName: name,
    type: 'event' as const,
    segment: 'event' as const,
    filters: [],
  };
}

export async function getUserFlowCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    startEvent: string;
    endEvent?: string;
    mode: 'after' | 'before' | 'between';
    steps?: number;
    exclude?: string[];
    include?: string[];
  }
) {
  if (input.mode === 'between' && !input.endEvent) {
    throw new Error('endEvent is required when mode is "between"');
  }

  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const result = await getSankey(deps, {
    projectId: input.projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    steps: input.steps ?? DEFAULT_SANKEY_STEPS,
    mode: input.mode,
    startEvent: toChartEvent(input.startEvent),
    endEvent: input.endEvent ? toChartEvent(input.endEvent) : undefined,
    exclude: input.exclude ?? [],
    include: input.include,
    timezone,
  });

  return {
    mode: input.mode,
    startEvent: input.startEvent,
    endEvent: input.endEvent,
    node_count: result.nodes.length,
    link_count: result.links.length,
    nodes: result.nodes,
    links: result.links,
  };
}

/** See funnel.service.ts's `createFunnelService` for why each chart
 * Sub-module carries its own factory. */
export function createSankeyService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getRawWhereClause,
    getSankey: (
      input: Parameters<typeof getSankey>[1]
    ): ReturnType<typeof getSankey> => getSankey(deps, input),
    getUserFlowCore: (
      input: Parameters<typeof getUserFlowCore>[1]
    ): ReturnType<typeof getUserFlowCore> => getUserFlowCore(deps, input),
  };
}
