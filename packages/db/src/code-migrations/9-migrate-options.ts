import { db } from '../prisma-client';
import type { IReportOptions } from './constants';
import { printBoxMessage } from './helpers';

export async function up() {
  printBoxMessage('🔄 Migrating Legacy Fields to Options', []);

  const reports = await db.report.findMany({
    select: {
      id: true,
      chartType: true,
      funnelGroup: true,
      funnelWindow: true,
      criteria: true,
      options: true,
      name: true,
    },
  });

  let migratedCount = 0;
  let skippedCount = 0;

  for (const report of reports) {
    const currentOptions = report.options as IReportOptions | null | undefined;

    if (
      currentOptions &&
      typeof currentOptions === 'object' &&
      'type' in currentOptions
    ) {
      skippedCount++;
      continue;
    }

    let newOptions: IReportOptions | null = null;

    if (report.chartType === 'funnel') {
      if (report.funnelGroup || report.funnelWindow !== null) {
        newOptions = {
          type: 'funnel',
          funnelGroup: report.funnelGroup ?? undefined,
          funnelWindow: report.funnelWindow ?? undefined,
        };
      }
    } else if (report.chartType === 'retention') {
      if (report.criteria) {
        newOptions = {
          type: 'retention',
          criteria: report.criteria as 'on_or_after' | 'on' | undefined,
        };
      }
    } else if (report.chartType === 'sankey') {
      skippedCount++;
      continue;
    }

    if (newOptions) {
      console.log(
        `Migrating report ${report.name} (${report.id}) - chartType: ${report.chartType}`
      );

      await db.report.update({
        where: { id: report.id },
        data: {
          options: newOptions,
          funnelGroup: null,
          funnelWindow: null,
          criteria: report.chartType === 'retention' ? null : report.criteria,
        },
      });

      migratedCount++;
    } else {
      skippedCount++;
    }
  }

  printBoxMessage('✅ Migration Complete', [
    `Migrated: ${migratedCount} reports`,
    `Skipped: ${skippedCount} reports (already migrated or no legacy fields)`,
  ]);
}
