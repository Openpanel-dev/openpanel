import { z } from 'zod';
import { db } from '@openpanel/db';
import { chatTool, truncateRows } from './helpers';

export const listInsights = chatTool(
  {
    name: 'list_insights',
    description:
      'List active auto-detected insights for this project, sorted by impact. Each has module (geo/devices/referrers/etc.), direction (up/down/flat), severity, and impact score.',
    schema: z.object({
      limit: z.number().min(1).max(500).default(50).optional(),
      moduleKey: z
        .string()
        .optional()
        .describe('Filter by module: geo, devices, referrers, entry-pages, page-trends, exit-pages, traffic-anomalies'),
      severity: z
        .enum(['severe', 'moderate', 'low'])
        .optional(),
      direction: z.enum(['up', 'down', 'flat']).optional(),
    }),
  },
  async ({ limit, moduleKey, severity, direction }, context) => {
    const insights = await db.projectInsight.findMany({
      where: {
        projectId: context.projectId,
        state: 'active',
        ...(moduleKey ? { moduleKey } : {}),
        ...(severity ? { severityBand: severity } : {}),
        ...(direction ? { direction } : {}),
      },
      orderBy: { impactScore: 'desc' },
      take: limit ?? 50,
    });
    // Project to a UI/LLM-friendly shape. Order matters: the table
    // renderer uses the first string column as the label, and we want
    // the human title there — not the UUID.
    return truncateRows(
      insights.map((i) => ({
        title: i.title,
        summary: i.summary ?? '',
        module: i.moduleKey,
        dimension: i.dimensionKey,
        direction: i.direction ?? '',
        severity: i.severityBand ?? '',
        impact: Math.round(i.impactScore),
        window: i.windowKind,
        // Keep the id LAST so the model can call explain_insight with it,
        // but the table won't pick it as the label column.
        id: i.id,
      })),
      100,
    );
  },
);

export const explainInsight = chatTool(
  {
    name: 'explain_insight',
    description:
      'Get a single insight by ID with its full payload (the structured data the dashboard renders) plus its event history (when first detected, version updates).',
    schema: z.object({
      insightId: z.string(),
    }),
  },
  async ({ insightId }, context) => {
    const insight = await db.projectInsight.findFirst({
      where: { id: insightId, projectId: context.projectId },
    });
    if (!insight) {
      return { error: 'Insight not found', insightId };
    }
    const events = await db.insightEvent.findMany({
      where: { insightId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { insight, events };
  },
);

export const findRelatedInsights = chatTool(
  {
    name: 'find_related_insights',
    description:
      'Given one insight, find others that share the same module or dimension. Useful when one insight prompts a "what else is going on with this country/page/device?" follow-up.',
    schema: z.object({
      insightId: z.string(),
      limit: z.number().min(1).max(50).default(10).optional(),
    }),
  },
  async ({ insightId, limit }, context) => {
    const insight = await db.projectInsight.findFirst({
      where: { id: insightId, projectId: context.projectId },
    });
    if (!insight) {
      return { error: 'Insight not found', insightId };
    }
    const related = await db.projectInsight.findMany({
      where: {
        projectId: context.projectId,
        id: { not: insightId },
        state: 'active',
        OR: [
          { moduleKey: insight.moduleKey },
          { dimensionKey: insight.dimensionKey },
        ],
      },
      orderBy: { impactScore: 'desc' },
      take: limit ?? 10,
    });
    return {
      source_insight: { id: insight.id, moduleKey: insight.moduleKey, dimensionKey: insight.dimensionKey },
      related_count: related.length,
      related,
    };
  },
);
