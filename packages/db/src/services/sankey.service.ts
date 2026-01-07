import { chartColors } from '@openpanel/constants';
import { type IChartEventFilter, zChartEvent } from '@openpanel/validation';
import { z } from 'zod';
import { TABLE_NAMES, ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { getEventFiltersWhereClause } from './chart.service';

export const zGetSankeyInput = z.object({
  projectId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  steps: z.number().min(2).max(10).default(5),
  mode: z.enum(['between', 'after', 'before']),
  startEvent: zChartEvent,
  endEvent: zChartEvent.optional(),
  exclude: z.array(z.string()).default([]),
  include: z.array(z.string()).optional(),
});

export type IGetSankeyInput = z.infer<typeof zGetSankeyInput> & {
  timezone: string;
};

export class SankeyService {
  constructor(private client: typeof ch) {}

  getRawWhereClause(type: 'events' | 'sessions', filters: IChartEventFilter[]) {
    const where = getEventFiltersWhereClause(
      filters.map((item) => {
        if (type === 'sessions') {
          if (item.name === 'path') {
            return { ...item, name: 'entry_path' };
          }
          if (item.name === 'origin') {
            return { ...item, name: 'entry_origin' };
          }
          if (item.name.startsWith('properties.__query.utm_')) {
            return {
              ...item,
              name: item.name.replace('properties.__query.utm_', 'utm_'),
            };
          }
          return item;
        }
        return item;
      }),
    );

    return Object.values(where).join(' AND ');
  }

  private buildEventNameFilter(
    include: string[] | undefined,
    exclude: string[],
    startEventName: string | undefined,
    endEventName: string | undefined,
  ) {
    if (include && include.length > 0) {
      const eventNames = [...include, startEventName, endEventName]
        .filter((item) => item !== undefined)
        .map((e) => `'${e!.replace(/'/g, "''")}'`)
        .join(', ');
      return `name IN (${eventNames})`;
    }
    if (exclude.length > 0) {
      const excludedNames = exclude
        .map((e) => `'${e.replace(/'/g, "''")}'`)
        .join(', ');
      return `name NOT IN (${excludedNames})`;
    }
    return null;
  }

  private buildSessionEventCTE(
    event: z.infer<typeof zChartEvent>,
    projectId: string,
    startDate: string,
    endDate: string,
    timezone: string,
  ): ReturnType<typeof clix> {
    return clix(this.client, timezone)
      .select<{ session_id: string }>(['session_id'])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('name', '=', event.name)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(this.getRawWhereClause('events', event.filters))
      .groupBy(['session_id']);
  }

  private getModeConfig(
    mode: 'after' | 'before' | 'between',
    startEvent: z.infer<typeof zChartEvent> | undefined,
    endEvent: z.infer<typeof zChartEvent> | undefined,
    hasStartEventCTE: boolean,
    hasEndEventCTE: boolean,
    steps: number,
  ): { sessionFilter: string; eventsSliceExpr: string } {
    const defaultSliceExpr = `arraySlice(events_deduped, 1, ${steps})`;

    if (mode === 'after' && startEvent) {
      const escapedStartEvent = startEvent.name.replace(/'/g, "''");
      const sessionFilter = hasStartEventCTE
        ? 'session_id IN (SELECT session_id FROM start_event_sessions)'
        : `arrayExists(x -> x = '${escapedStartEvent}', events_deduped)`;
      const eventsSliceExpr = `arraySlice(events_deduped, arrayFirstIndex(x -> x = '${escapedStartEvent}', events_deduped), ${steps})`;
      return { sessionFilter, eventsSliceExpr };
    }

    if (mode === 'before' && startEvent) {
      const escapedStartEvent = startEvent.name.replace(/'/g, "''");
      const sessionFilter = hasStartEventCTE
        ? 'session_id IN (SELECT session_id FROM start_event_sessions)'
        : `arrayExists(x -> x = '${escapedStartEvent}', events_deduped)`;
      const eventsSliceExpr = `arraySlice(
        events_deduped,
        greatest(1, arrayFirstIndex(x -> x = '${escapedStartEvent}', events_deduped) - ${steps} + 1),
        arrayFirstIndex(x -> x = '${escapedStartEvent}', events_deduped) - greatest(1, arrayFirstIndex(x -> x = '${escapedStartEvent}', events_deduped) - ${steps} + 1) + 1
      )`;
      return { sessionFilter, eventsSliceExpr };
    }

    if (mode === 'between' && startEvent && endEvent) {
      const escapedStartEvent = startEvent.name.replace(/'/g, "''");
      const escapedEndEvent = endEvent.name.replace(/'/g, "''");
      let sessionFilter = '';
      if (hasStartEventCTE && hasEndEventCTE) {
        sessionFilter =
          'session_id IN (SELECT session_id FROM start_event_sessions) AND session_id IN (SELECT session_id FROM end_event_sessions)';
      } else if (hasStartEventCTE) {
        sessionFilter = `session_id IN (SELECT session_id FROM start_event_sessions) AND arrayExists(x -> x = '${escapedEndEvent}', events_deduped)`;
      } else if (hasEndEventCTE) {
        sessionFilter = `arrayExists(x -> x = '${escapedStartEvent}', events_deduped) AND session_id IN (SELECT session_id FROM end_event_sessions)`;
      } else {
        sessionFilter = `arrayExists(x -> x = '${escapedStartEvent}', events_deduped) AND arrayExists(x -> x = '${escapedEndEvent}', events_deduped)`;
      }
      return { sessionFilter, eventsSliceExpr: defaultSliceExpr };
    }

    return { sessionFilter: '', eventsSliceExpr: defaultSliceExpr };
  }

  private async executeBetweenMode(
    sessionPathsQuery: ReturnType<typeof clix>,
    startEvent: z.infer<typeof zChartEvent>,
    endEvent: z.infer<typeof zChartEvent>,
    steps: number,
    COLORS: string[],
    timezone: string,
  ): Promise<{
    nodes: Array<{
      id: string;
      label: string;
      nodeColor: string;
      percentage?: number;
      value?: number;
      step?: number;
    }>;
    links: Array<{ source: string; target: string; value: number }>;
  }> {
    // Find sessions where startEvent comes before endEvent
    const betweenSessionsQuery = clix(this.client, timezone)
      .with('session_paths', sessionPathsQuery)
      .select<{
        session_id: string;
        events: string[];
        start_index: number;
        end_index: number;
      }>([
        'session_id',
        'events',
        `arrayFirstIndex(x -> x = '${startEvent.name.replace(/'/g, "''")}', events) as start_index`,
        `arrayFirstIndex(x -> x = '${endEvent.name.replace(/'/g, "''")}', events) as end_index`,
      ])
      .from('session_paths')
      .having('start_index', '>', 0)
      .having('end_index', '>', 0)
      .rawHaving('start_index < end_index');

    // Get the slice between start and end
    const betweenPathsQuery = clix(this.client, timezone)
      .with('between_sessions', betweenSessionsQuery)
      .select<{
        session_id: string;
        events: string[];
        entry_event: string;
      }>([
        'session_id',
        'arraySlice(events, start_index, end_index - start_index + 1) as events',
        'events[start_index] as entry_event',
      ])
      .from('between_sessions');

    // Get top entry events
    const topEntriesQuery = clix(this.client, timezone)
      .with('session_paths', betweenPathsQuery)
      .select<{ entry_event: string; count: number }>([
        'entry_event',
        'count() as count',
      ])
      .from('session_paths')
      .groupBy(['entry_event'])
      .orderBy('count', 'DESC')
      .limit(3);

    const topEntries = await topEntriesQuery.execute();

    if (topEntries.length === 0) {
      return { nodes: [], links: [] };
    }

    const topEntryEvents = topEntries.map((e) => e.entry_event);
    const totalSessions = topEntries.reduce((sum, e) => sum + e.count, 0);

    // Get transitions for between mode
    const transitionsQuery = clix(this.client, timezone)
      .with('between_sessions', betweenSessionsQuery)
      .with(
        'session_paths',
        clix(this.client, timezone)
          .select([
            'session_id',
            'arraySlice(events, start_index, end_index - start_index + 1) as events',
          ])
          .from('between_sessions')
          .having('events[1]', 'IN', topEntryEvents),
      )
      .select<{
        source: string;
        target: string;
        step: number;
        value: number;
      }>([
        'pair.1 as source',
        'pair.2 as target',
        'pair.3 as step',
        'count() as value',
      ])
      .from(
        clix.exp(
          '(SELECT arrayJoin(arrayMap(i -> (events[i], events[i + 1], i), range(1, length(events)))) as pair FROM session_paths WHERE length(events) >= 2)',
        ),
      )
      .groupBy(['source', 'target', 'step'])
      .orderBy('step', 'ASC')
      .orderBy('value', 'DESC');

    const transitions = await transitionsQuery.execute();

    return this.buildSankeyFromTransitions(
      transitions,
      topEntries,
      totalSessions,
      steps,
      COLORS,
    );
  }

  private async executeSimpleMode(
    sessionPathsQuery: ReturnType<typeof clix>,
    steps: number,
    COLORS: string[],
    timezone: string,
  ): Promise<{
    nodes: Array<{
      id: string;
      label: string;
      nodeColor: string;
      percentage?: number;
      value?: number;
      step?: number;
    }>;
    links: Array<{ source: string; target: string; value: number }>;
  }> {
    // Get top entry events
    const topEntriesQuery = clix(this.client, timezone)
      .with('session_paths', sessionPathsQuery)
      .select<{ entry_event: string; count: number }>([
        'entry_event',
        'count() as count',
      ])
      .from('session_paths')
      .groupBy(['entry_event'])
      .orderBy('count', 'DESC')
      .limit(3);

    const topEntries = await topEntriesQuery.execute();

    if (topEntries.length === 0) {
      return { nodes: [], links: [] };
    }

    const topEntryEvents = topEntries.map((e) => e.entry_event);
    const totalSessions = topEntries.reduce((sum, e) => sum + e.count, 0);

    // Get transitions
    const transitionsQuery = clix(this.client, timezone)
      .with('session_paths_base', sessionPathsQuery)
      .with(
        'session_paths',
        clix(this.client, timezone)
          .select(['session_id', 'events'])
          .from('session_paths_base')
          .having('events[1]', 'IN', topEntryEvents),
      )
      .select<{
        source: string;
        target: string;
        step: number;
        value: number;
      }>([
        'pair.1 as source',
        'pair.2 as target',
        'pair.3 as step',
        'count() as value',
      ])
      .from(
        clix.exp(
          '(SELECT arrayJoin(arrayMap(i -> (events[i], events[i + 1], i), range(1, length(events)))) as pair FROM session_paths WHERE length(events) >= 2)',
        ),
      )
      .groupBy(['source', 'target', 'step'])
      .orderBy('step', 'ASC')
      .orderBy('value', 'DESC');

    const transitions = await transitionsQuery.execute();

    return this.buildSankeyFromTransitions(
      transitions,
      topEntries,
      totalSessions,
      steps,
      COLORS,
    );
  }

  async getSankey({
    projectId,
    startDate,
    endDate,
    steps = 5,
    mode,
    startEvent,
    endEvent,
    exclude = [],
    include,
    timezone,
  }: IGetSankeyInput): Promise<{
    nodes: Array<{
      id: string;
      label: string;
      nodeColor: string;
      percentage?: number;
      value?: number;
      step?: number;
    }>;
    links: Array<{ source: string; target: string; value: number }>;
  }> {
    const COLORS = chartColors.map((color) => color.main);

    // 1. Build event name filter
    const eventNameFilter = this.buildEventNameFilter(
      include,
      exclude,
      startEvent?.name,
      endEvent?.name,
    );

    // 2. Build ordered events query
    // For screen_view events, use the path instead of the event name for more meaningful flow visualization
    const orderedEventsQuery = clix(this.client, timezone)
      .select<{
        session_id: string;
        event_name: string;
        created_at: string;
      }>([
        'session_id',
        // "if(name = 'screen_view', path, name) as event_name",
        'name as event_name',
        'created_at',
      ])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .orderBy('session_id', 'ASC')
      .orderBy('created_at', 'ASC');

    if (eventNameFilter) {
      orderedEventsQuery.rawWhere(eventNameFilter);
    }

    // 3. Build session event CTEs
    const startEventCTE = startEvent
      ? this.buildSessionEventCTE(
          startEvent,
          projectId,
          startDate,
          endDate,
          timezone,
        )
      : null;
    const endEventCTE =
      mode === 'between' && endEvent
        ? this.buildSessionEventCTE(
            endEvent,
            projectId,
            startDate,
            endDate,
            timezone,
          )
        : null;

    // 4. Build deduped events CTE
    const eventsDedupedCTE = clix(this.client, timezone)
      .with('ordered_events', orderedEventsQuery)
      .select<{
        session_id: string;
        events_deduped: string[];
      }>([
        'session_id',
        `arrayFilter(
          (x, i) -> i = 1 OR x != events_raw[i - 1],
          groupArray(event_name) as events_raw,
          arrayEnumerate(events_raw)
        ) as events_deduped`,
      ])
      .from('ordered_events')
      .groupBy(['session_id']);

    // 5. Get mode-specific config
    const { sessionFilter, eventsSliceExpr } = this.getModeConfig(
      mode,
      startEvent,
      endEvent,
      startEventCTE !== null,
      endEventCTE !== null,
      steps,
    );

    // 6. Build truncate expression (for 'after' mode)
    const truncateAtRepeatExpr = `if(
      arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(events_sliced)) = 0,
      events_sliced,
      arraySlice(
        events_sliced,
        1,
        arrayFirstIndex(x -> x > 1, arrayEnumerateUniq(events_sliced)) - 1
      )
    )`;
    const eventsExpr =
      mode === 'before' ? 'events_sliced' : truncateAtRepeatExpr;

    // 7. Build session paths query with conditional CTEs
    const eventCTEs: Array<{ name: string; query: ReturnType<typeof clix> }> =
      [];
    if (startEventCTE) {
      eventCTEs.push({ name: 'start_event_sessions', query: startEventCTE });
    }
    if (endEventCTE) {
      eventCTEs.push({ name: 'end_event_sessions', query: endEventCTE });
    }

    const sessionPathsQuery = eventCTEs
      .reduce(
        (builder, cte) => builder.with(cte.name, cte.query),
        clix(this.client, timezone),
      )
      .with('events_deduped_cte', eventsDedupedCTE)
      .with(
        'events_sliced_cte',
        clix(this.client, timezone)
          .select<{
            session_id: string;
            events_sliced: string[];
          }>(['session_id', `${eventsSliceExpr} as events_sliced`])
          .from('events_deduped_cte')
          .rawHaving(sessionFilter || '1 = 1'),
      )
      .select<{
        session_id: string;
        entry_event: string;
        events: string[];
      }>(['session_id', `${eventsExpr} as events`, 'events[1] as entry_event'])
      .from('events_sliced_cte')
      .having('length(events)', '>=', 2);

    // 8. Execute mode-specific logic
    if (mode === 'between' && startEvent && endEvent) {
      return this.executeBetweenMode(
        sessionPathsQuery,
        startEvent,
        endEvent,
        steps,
        COLORS,
        timezone,
      );
    }

    return this.executeSimpleMode(sessionPathsQuery, steps, COLORS, timezone);
  }

  private buildSankeyFromTransitions(
    transitions: Array<{
      source: string;
      target: string;
      step: number;
      value: number;
    }>,
    topEntries: Array<{ entry_event: string; count: number }>,
    totalSessions: number,
    steps: number,
    COLORS: string[],
  ) {
    if (transitions.length === 0) {
      return { nodes: [], links: [] };
    }

    const TOP_DESTINATIONS_PER_NODE = 3;

    // Build the sankey progressively step by step
    const nodes = new Map<
      string,
      { event: string; value: number; step: number; color: string }
    >();
    const links: Array<{ source: string; target: string; value: number }> = [];

    // Helper to create unique node ID
    const getNodeId = (event: string, step: number) => `${event}::step${step}`;

    // Group transitions by step
    const transitionsByStep = new Map<number, typeof transitions>();
    for (const t of transitions) {
      if (!transitionsByStep.has(t.step)) {
        transitionsByStep.set(t.step, []);
      }
      transitionsByStep.get(t.step)!.push(t);
    }

    // Initialize with entry events (step 1)
    const activeNodes = new Map<string, string>(); // event -> nodeId
    topEntries.forEach((entry, idx) => {
      const nodeId = getNodeId(entry.entry_event, 1);
      nodes.set(nodeId, {
        event: entry.entry_event,
        value: entry.count,
        step: 1,
        color: COLORS[idx % COLORS.length]!,
      });
      activeNodes.set(entry.entry_event, nodeId);
    });

    // Process each step: from active nodes, find top destinations
    for (let step = 1; step < steps; step++) {
      const stepTransitions = transitionsByStep.get(step) || [];
      const nextActiveNodes = new Map<string, string>();

      // For each currently active node, find its top destinations
      for (const [sourceEvent, sourceNodeId] of activeNodes) {
        // Get transitions FROM this source event
        const fromSource = stepTransitions
          .filter((t) => t.source === sourceEvent)
          .sort((a, b) => b.value - a.value)
          .slice(0, TOP_DESTINATIONS_PER_NODE);

        for (const t of fromSource) {
          // Skip self-loops
          if (t.source === t.target) continue;

          const targetNodeId = getNodeId(t.target, step + 1);

          // Add link using unique node IDs
          links.push({
            source: sourceNodeId,
            target: targetNodeId,
            value: t.value,
          });

          // Add/update target node
          const existing = nodes.get(targetNodeId);
          if (existing) {
            existing.value += t.value;
          } else {
            // Inherit color from source or assign new
            const sourceData = nodes.get(sourceNodeId);
            nodes.set(targetNodeId, {
              event: t.target,
              value: t.value,
              step: step + 1,
              color: sourceData?.color || COLORS[nodes.size % COLORS.length]!,
            });
          }

          nextActiveNodes.set(t.target, targetNodeId);
        }
      }

      // Update active nodes for next iteration
      activeNodes.clear();
      for (const [event, nodeId] of nextActiveNodes) {
        activeNodes.set(event, nodeId);
      }

      // Stop if no more nodes to process
      if (activeNodes.size === 0) break;
    }

    // Filter links by threshold (0.25% of total sessions)
    const MIN_LINK_PERCENT = 0.25;
    const minLinkValue = Math.ceil((totalSessions * MIN_LINK_PERCENT) / 100);
    const filteredLinks = links.filter((link) => link.value >= minLinkValue);

    // Find all nodes referenced by remaining links
    const referencedNodeIds = new Set<string>();
    filteredLinks.forEach((link) => {
      referencedNodeIds.add(link.source);
      referencedNodeIds.add(link.target);
    });

    // Recompute node values from filtered links
    const nodeValuesFromLinks = new Map<string, number>();
    filteredLinks.forEach((link) => {
      const current = nodeValuesFromLinks.get(link.target) || 0;
      nodeValuesFromLinks.set(link.target, current + link.value);
    });

    // For entry nodes (step 1), only keep them if they have outgoing links after filtering
    nodes.forEach((nodeData, nodeId) => {
      if (nodeData.step === 1) {
        const hasOutgoing = filteredLinks.some((l) => l.source === nodeId);
        if (!hasOutgoing) {
          referencedNodeIds.delete(nodeId);
        }
      }
    });

    // Build final nodes array sorted by step then value
    const finalNodes = Array.from(nodes.entries())
      .filter(([id]) => referencedNodeIds.has(id))
      .map(([id, data]) => {
        const value =
          data.step === 1
            ? data.value
            : nodeValuesFromLinks.get(id) || data.value;
        return {
          id,
          label: data.event,
          nodeColor: data.color,
          percentage: (value / totalSessions) * 100,
          value,
          step: data.step,
        };
      })
      .sort((a, b) => {
        if (a.step !== b.step) return a.step - b.step;
        return b.value - a.value;
      });

    // Sanity check: Ensure all link endpoints exist in nodes
    const nodeIds = new Set(finalNodes.map((n) => n.id));
    const validLinks = filteredLinks.filter(
      (link) => nodeIds.has(link.source) && nodeIds.has(link.target),
    );

    // Combine final nodes with the same event name
    // A final node is one that has no outgoing links
    const nodesWithOutgoing = new Set(validLinks.map((l) => l.source));
    const finalNodeIds = new Set(
      finalNodes.filter((n) => !nodesWithOutgoing.has(n.id)).map((n) => n.id),
    );

    // Group final nodes by event name
    const finalNodesByEvent = new Map<string, typeof finalNodes>();
    finalNodes.forEach((node) => {
      if (finalNodeIds.has(node.id)) {
        if (!finalNodesByEvent.has(node.label)) {
          finalNodesByEvent.set(node.label, []);
        }
        finalNodesByEvent.get(node.label)!.push(node);
      }
    });

    // Create merged nodes and remap links
    const nodeIdRemap = new Map<string, string>(); // old nodeId -> new merged nodeId
    const mergedNodes = new Map<string, (typeof finalNodes)[0]>(); // merged nodeId -> node data

    finalNodesByEvent.forEach((nodesToMerge, eventName) => {
      if (nodesToMerge.length > 1) {
        // Merge multiple final nodes with same event name
        const maxStep = Math.max(...nodesToMerge.map((n) => n.step || 0));
        const totalValue = nodesToMerge.reduce(
          (sum, n) => sum + (n.value || 0),
          0,
        );
        const mergedNodeId = `${eventName}::final`;
        const firstNode = nodesToMerge[0]!;

        // Create merged node at the maximum step
        mergedNodes.set(mergedNodeId, {
          id: mergedNodeId,
          label: eventName,
          nodeColor: firstNode.nodeColor,
          percentage: (totalValue / totalSessions) * 100,
          value: totalValue,
          step: maxStep,
        });

        // Map all old node IDs to the merged node ID
        nodesToMerge.forEach((node) => {
          nodeIdRemap.set(node.id, mergedNodeId);
        });
      }
    });

    // Update links to point to merged nodes
    const remappedLinks = validLinks.map((link) => {
      const newSource = nodeIdRemap.get(link.source) || link.source;
      const newTarget = nodeIdRemap.get(link.target) || link.target;
      return {
        source: newSource,
        target: newTarget,
        value: link.value,
      };
    });

    // Combine merged nodes with non-final nodes
    const nonFinalNodes = finalNodes.filter((n) => !finalNodeIds.has(n.id));
    const finalNodesList = Array.from(mergedNodes.values());

    // Remove old final nodes that were merged
    const mergedOldNodeIds = new Set(nodeIdRemap.keys());
    const remainingNodes = nonFinalNodes.filter(
      (n) => !mergedOldNodeIds.has(n.id),
    );

    // Combine all nodes and sort
    const allNodes = [...remainingNodes, ...finalNodesList].sort((a, b) => {
      if (a.step !== b.step) return a.step! - b.step!;
      return b.value! - a.value!;
    });

    // Aggregate links that now point to the same merged target
    const linkMap = new Map<string, number>(); // "source->target" -> value
    remappedLinks.forEach((link) => {
      const key = `${link.source}->${link.target}`;
      linkMap.set(key, (linkMap.get(key) || 0) + link.value);
    });

    const aggregatedLinks = Array.from(linkMap.entries())
      .map(([key, value]) => {
        const parts = key.split('->');
        if (parts.length !== 2) return null;
        return { source: parts[0]!, target: parts[1]!, value };
      })
      .filter(
        (link): link is { source: string; target: string; value: number } =>
          link !== null,
      );

    // Final sanity check: Ensure all link endpoints exist in nodes
    const finalNodeIdsSet = new Set(allNodes.map((n) => n.id));
    const finalValidLinks: Array<{
      source: string;
      target: string;
      value: number;
    }> = aggregatedLinks.filter(
      (link) =>
        finalNodeIdsSet.has(link.source) && finalNodeIdsSet.has(link.target),
    );

    return {
      nodes: allNodes,
      links: finalValidLinks,
    };
  }
}

export const sankeyService = new SankeyService(ch);
