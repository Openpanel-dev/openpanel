import { tool } from 'ai';
import { z } from 'zod';
import type { ChatToolContext } from '../context';
import { resolveRange, truncateRows } from './shared';

const DEFAULT_AROUND_DAYS = 7;
const MAX_AROUND_DAYS = 90;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MS_PER_DAY = 86_400_000;
const DATE_LENGTH = 10;

export function referenceTools(ctx: ChatToolContext) {
  const { deps, projectId } = ctx;

  return {
    list_references: tool({
      description:
        "The team's own annotations: launches, campaigns, deploys, press. Check these before explaining a spike or drop; pass `aroundDate` to look a week either side of a date.",
      inputSchema: z.object({
        startDate: z.string().optional().describe('YYYY-MM-DD'),
        endDate: z.string().optional().describe('YYYY-MM-DD'),
        aroundDate: z
          .string()
          .optional()
          .describe(
            'YYYY-MM-DD. Overrides start and end with a window around this date.'
          ),
        days: z
          .number()
          .int()
          .min(0)
          .max(MAX_AROUND_DAYS)
          .default(DEFAULT_AROUND_DAYS),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
      }),
      execute: async ({
        startDate,
        endDate,
        aroundDate,
        days,
        search,
        limit,
      }) => {
        let window: { gte: Date; lte: Date };
        if (aroundDate) {
          const target = new Date(aroundDate);
          if (Number.isNaN(target.getTime())) {
            return { error: 'Invalid aroundDate', aroundDate };
          }
          window = {
            gte: new Date(target.getTime() - days * MS_PER_DAY),
            lte: new Date(target.getTime() + days * MS_PER_DAY),
          };
        } else {
          const range = resolveRange(ctx, { startDate, endDate });
          window = {
            gte: new Date(range.startDate),
            lte: new Date(range.endDate),
          };
        }
        const rows = await deps.db.reference.findMany({
          where: {
            projectId,
            date: window,
            ...(search
              ? {
                  OR: [
                    {
                      title: { contains: search, mode: 'insensitive' as const },
                    },
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
          take: limit,
        });
        return {
          window: {
            start: window.gte.toISOString().slice(0, DATE_LENGTH),
            end: window.lte.toISOString().slice(0, DATE_LENGTH),
          },
          ...truncateRows(
            rows.map((row) => ({
              id: row.id,
              title: row.title,
              date: row.date.toISOString().slice(0, DATE_LENGTH),
              description: row.description ?? '',
            })),
            limit
          ),
        };
      },
    }),
  };
}
