import { z } from 'zod';
import {
  getEventPropertyValuesCore,
  listEventPropertiesCore,
  queryEventsCore,
} from '@openpanel/db';
import {
  chatTool,
  compactEventProperties,
  resolveDateRange,
  truncateRows,
} from './helpers';

export const analyzeEventDistribution = chatTool(
  {
    name: 'analyze_event_distribution',
    description:
      'For a set of events (or all events in the current view), break down their frequency, top properties, and top sources. Useful for "which events fire the most?" questions.',
    schema: z.object({
      eventNames: z.array(z.string()).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  async ({ eventNames, startDate, endDate }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });

    const events = await queryEventsCore({
      projectId: context.projectId,
      eventNames,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: 100,
    });

    // Tally frequency by event name
    const frequency = new Map<string, number>();
    const byCountry = new Map<string, number>();
    const byDevice = new Map<string, number>();
    for (const e of events) {
      frequency.set(e.name, (frequency.get(e.name) ?? 0) + 1);
      if (e.country) byCountry.set(e.country, (byCountry.get(e.country) ?? 0) + 1);
      if (e.device) byDevice.set(e.device, (byDevice.get(e.device) ?? 0) + 1);
    }

    const top = (m: Map<string, number>, n: number) =>
      Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, count]) => ({ name, count }));

    return {
      sample_size: events.length,
      event_frequency: top(frequency, 20),
      top_countries: top(byCountry, 10),
      top_devices: top(byDevice, 10),
    };
  },
);

export const correlateEvents = chatTool(
  {
    name: 'correlate_events',
    description:
      'Find pairs of events that frequently occur in the same session. Returns event pairs ranked by co-occurrence count.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  async ({ startDate, endDate }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });

    const events = await queryEventsCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: 100,
    });

    // Group events by sessionId, then count co-occurring event-name pairs
    const bySession = new Map<string, Set<string>>();
    for (const e of events) {
      if (!e.session_id) continue;
      if (!bySession.has(e.session_id)) bySession.set(e.session_id, new Set());
      bySession.get(e.session_id)?.add(e.name);
    }

    const pairCounts = new Map<string, number>();
    for (const eventNames of bySession.values()) {
      const list = Array.from(eventNames).sort();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const key = `${list[i]} + ${list[j]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    const pairs = Array.from(pairCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([pair, count]) => ({ pair, count }));

    return {
      sample_sessions: bySession.size,
      top_pairs: pairs,
    };
  },
);

export const getEventPropertyDistribution = chatTool(
  {
    name: 'get_event_property_distribution',
    description:
      'Distribution of distinct values for a specific property on a specific event. Use to answer "what countries fire screen_view most?" type questions.',
    schema: z.object({
      eventName: z.string(),
      propertyKey: z.string(),
    }),
  },
  async ({ eventName, propertyKey }, context) => {
    const result = await getEventPropertyValuesCore({
      projectId: context.projectId,
      eventName,
      propertyKey,
    });
    return truncateRows(result.values, 100);
  },
);

export const listPropertiesForEvent = chatTool(
  {
    name: 'list_properties_for_event',
    description:
      'List property keys available for a specific event (or all events). Useful before correlating or filtering. Dotted sub-keys are rolled up to their root (e.g. all `__query.*` become a single `__query`); ordered by how many sub-keys roll up under each root.',
    schema: z.object({
      eventName: z.string().optional(),
    }),
  },
  async ({ eventName }, context) => {
    const raw = await listEventPropertiesCore({
      projectId: context.projectId,
      eventName,
    });
    return compactEventProperties(raw, { eventName });
  },
);
