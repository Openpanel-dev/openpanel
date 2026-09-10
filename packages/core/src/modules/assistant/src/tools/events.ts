import { z } from 'zod';
import type { ServiceDeps } from '../../../../services';
import {
  getEventPropertyValuesCore,
  queryEventsCore,
} from '../../../event/event.service';
import { chatTool, resolveDateRange, truncateRows } from './helpers';

/** How many recent events `analyze_event_distribution` tallies. */
const DISTRIBUTION_SAMPLE_LIMIT = 100;
/** How many recent events `correlate_events` pairs up by session. */
const CORRELATION_SAMPLE_LIMIT = 100;

export const analyzeEventDistribution = (deps: ServiceDeps) =>
  chatTool(
    {
      name: 'analyze_event_distribution',
      description: `For a set of events (or all events in the current view), break down their frequency, top countries and top devices. Computed from the ${DISTRIBUTION_SAMPLE_LIMIT} most recent matching events, NOT the whole period — \`sample_size\` is that sample, so describe the shape and never quote the counts as totals.`,
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

      const events = await queryEventsCore(deps, {
        projectId: context.projectId,
        eventNames,
        startDate: range.startDate,
        endDate: range.endDate,
        limit: DISTRIBUTION_SAMPLE_LIMIT,
      });

      // Tally frequency by event name
      const frequency = new Map<string, number>();
      const byCountry = new Map<string, number>();
      const byDevice = new Map<string, number>();
      for (const e of events) {
        frequency.set(e.name, (frequency.get(e.name) ?? 0) + 1);
        if (e.country) {
          byCountry.set(e.country, (byCountry.get(e.country) ?? 0) + 1);
        }
        if (e.device) {
          byDevice.set(e.device, (byDevice.get(e.device) ?? 0) + 1);
        }
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
    }
  );

export const correlateEvents = (deps: ServiceDeps) =>
  chatTool(
    {
      name: 'correlate_events',
      description: `Find pairs of events that frequently occur in the same session. Ranked by co-occurrence within the ${CORRELATION_SAMPLE_LIMIT} most recent events, NOT the whole period — treat the counts as a sample, never as totals.`,
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

      const events = await queryEventsCore(deps, {
        projectId: context.projectId,
        startDate: range.startDate,
        endDate: range.endDate,
        limit: CORRELATION_SAMPLE_LIMIT,
      });

      // Group events by sessionId, then count co-occurring event-name pairs
      const bySession = new Map<string, Set<string>>();
      for (const e of events) {
        if (!e.session_id) {
          continue;
        }
        if (!bySession.has(e.session_id)) {
          bySession.set(e.session_id, new Set());
        }
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
    }
  );

export const getEventPropertyDistribution = (deps: ServiceDeps) =>
  chatTool(
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
      const result = await getEventPropertyValuesCore(deps, {
        projectId: context.projectId,
        eventName,
        propertyKey,
      });
      return truncateRows(result.values, 100);
    }
  );
