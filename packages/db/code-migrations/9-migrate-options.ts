import type { IReportOptions } from '@openpanel/validation';
import { db } from '../index';
import { printBoxMessage } from './helpers';

export async function up() {
  printBoxMessage('🔄 Migrating Legacy Fields to Options', []);

  // Get all reports
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
    
    // Skip if options already exists and is valid
    if (currentOptions && typeof currentOptions === 'object' && 'type' in currentOptions) {
      skippedCount++;
      continue;
    }

    let newOptions: IReportOptions | null = null;

    // Migrate based on chart type
    if (report.chartType === 'funnel') {
      // Only create options if we have legacy fields to migrate
      if (report.funnelGroup || report.funnelWindow !== null) {
        newOptions = {
          type: 'funnel',
          funnelGroup: report.funnelGroup ?? undefined,
          funnelWindow: report.funnelWindow ?? undefined,
        };
      }
    } else if (report.chartType === 'retention') {
      // Only create options if we have criteria to migrate
      if (report.criteria) {
        newOptions = {
          type: 'retention',
          criteria: report.criteria as 'on_or_after' | 'on' | undefined,
        };
      }
    } else if (report.chartType === 'sankey') {
      // Sankey should already have options, but if not, skip
      skippedCount++;
      continue;
    }

    // Only update if we have new options to set
    if (newOptions) {
      console.log(
        `Migrating report ${report.name} (${report.id}) - chartType: ${report.chartType}`,
      );
      
      await db.report.update({
        where: { id: report.id },
        data: {
          options: newOptions,
          // Set legacy fields to null after migration
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


