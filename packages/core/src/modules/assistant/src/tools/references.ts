import { z } from 'zod';
import type { ServiceDeps } from '../../../../services';
import { getChartStartEndDate } from '../../../report/src/chart-dates';
import type { PageContext } from '../context';
import { chatRunContext } from '../run-context';
import { chatTool, resolveDateRange, truncateRows } from './helpers';

/**
 * References are manual annotations the user adds (e.g. "Launched new marketing
 * campaign" on 2026-03-15) so the AI can correlate traffic changes with
 * off-platform events.
 */

// Never read: `resolveDateRange` always returns both bounds, which is the case
// where `getChartStartEndDate` only normalizes them.
const UNUSED_FALLBACK_RANGE = '30d';

/** The same window the chart's reference annotations use for these filters. */
export function getReferenceDateWindow(filters: PageContext['filters']): {
  gte: Date;
  lte: Date;
} {
  const timezone = chatRunContext.getStore()?.timezone ?? 'UTC';
  const { startDate, endDate } = getChartStartEndDate(
    { ...resolveDateRange(filters), range: UNUSED_FALLBACK_RANGE },
    timezone
  );
  return { gte: new Date(startDate), lte: new Date(endDate) };
}

export const listReferences = (deps: ServiceDeps) =>
  chatTool(
    {
      name: 'list_references',
      description:
        "List the user's manual references (campaign launches, deploys, announcements, etc.). Use when the user asks about causes of traffic changes or wants to understand what was happening at a specific time. Defaults to the user's current page date range; pass explicit dates to override.",
      schema: z.object({
        startDate: z
          .string()
          .optional()
          .describe('ISO date YYYY-MM-DD. Defaults to the current view range.'),
        endDate: z
          .string()
          .optional()
          .describe('ISO date YYYY-MM-DD. Defaults to the current view range.'),
        search: z
          .string()
          .optional()
          .describe('Optional free-text filter on title/description.'),
        limit: z.number().min(1).max(100).default(50).optional(),
      }),
    },
    async ({ startDate, endDate, search, limit }, context) => {
      const dateWindow = getReferenceDateWindow({
        ...context.pageContext?.filters,
        startDate: startDate ?? context.pageContext?.filters?.startDate,
        endDate: endDate ?? context.pageContext?.filters?.endDate,
      });
      const db = deps.db;
      const rows = await db.reference.findMany({
        where: {
          projectId: context.projectId,
          date: dateWindow,
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  {
                    description: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: { date: 'desc' },
        take: limit ?? 50,
      });

      return truncateRows(
        rows.map((r) => ({
          title: r.title,
          date: r.date.toISOString().slice(0, 10),
          description: r.description ?? '',
          id: r.id,
        })),
        100
      );
    }
  );

export const getReferencesAround = (deps: ServiceDeps) =>
  chatTool(
    {
      name: 'get_references_around',
      description:
        'Find references within ±N days of a target date. Perfect for "what was happening around 2026-03-15?" — returns references that might explain a spike or drop.',
      schema: z.object({
        date: z.string().describe('Target date (YYYY-MM-DD) to search around.'),
        daysBefore: z.number().min(0).max(90).default(7).optional(),
        daysAfter: z.number().min(0).max(90).default(7).optional(),
      }),
    },
    async ({ date, daysBefore, daysAfter }, context) => {
      const target = new Date(date);
      if (Number.isNaN(target.getTime())) {
        return { error: 'Invalid date', date };
      }
      const before = daysBefore ?? 7;
      const after = daysAfter ?? 7;
      const start = new Date(target.getTime() - before * 86_400_000);
      const end = new Date(target.getTime() + after * 86_400_000);

      const db = deps.db;
      const rows = await db.reference.findMany({
        where: {
          projectId: context.projectId,
          date: { gte: start, lte: end },
        },
        orderBy: { date: 'asc' },
      });

      return {
        target_date: date,
        window: {
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
        },
        references: rows.map((r) => ({
          title: r.title,
          date: r.date.toISOString().slice(0, 10),
          description: r.description ?? '',
          id: r.id,
        })),
      };
    }
  );
