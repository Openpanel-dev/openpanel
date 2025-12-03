import { shortId } from '@openpanel/common';
import type {
  IChartEvent,
  IChartEventItem,
  IChartFormula,
} from '@openpanel/validation';
import { db } from '../index';
import { printBoxMessage } from './helpers';

export async function up() {
  printBoxMessage('🔄 Migrating Events to Series Format', []);

  // Get all reports
  const reports = await db.report.findMany({
    select: {
      id: true,
      events: true,
      formula: true,
      name: true,
    },
  });

  let migratedCount = 0;
  let skippedCount = 0;
  let formulaAddedCount = 0;

  for (const report of reports) {
    const events = report.events as unknown as Array<
      Partial<IChartEventItem> | Partial<IChartEvent>
    >;
    const oldFormula = report.formula;

    // Check if any event is missing the 'type' field (old format)
    const needsEventMigration =
      Array.isArray(events) &&
      events.length > 0 &&
      events.some(
        (event) => !event || typeof event !== 'object' || !('type' in event),
      );

    // Check if formula exists and isn't already in the series
    const hasFormulaInSeries =
      Array.isArray(events) &&
      events.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'formula',
      );

    const needsFormulaMigration = !!oldFormula && !hasFormulaInSeries;

    // Skip if no migration needed
    if (!needsEventMigration && !needsFormulaMigration) {
      skippedCount++;
      continue;
    }

    // Transform events to new format: add type: 'event' to each event
    const migratedSeries: IChartEventItem[] = Array.isArray(events)
      ? events.map((event) => {
          if (event && typeof event === 'object' && 'type' in event) {
            return event as IChartEventItem;
          }

          return {
            ...event,
            type: 'event',
          } as IChartEventItem;
        })
      : [];

    // Add formula to series if it exists and isn't already there
    if (needsFormulaMigration && oldFormula) {
      const formulaItem: IChartFormula = {
        type: 'formula',
        formula: oldFormula,
        id: shortId(),
      };
      migratedSeries.push(formulaItem);
      formulaAddedCount++;
    }

    console.log(
      `Updating report ${report.name} (${report.id}) with ${migratedSeries.length} series`,
    );
    // Update the report with migrated series
    await db.report.update({
      where: { id: report.id },
      data: {
        events: migratedSeries,
      },
    });

    migratedCount++;
  }

  printBoxMessage('✅ Migration Complete', [
    `Migrated: ${migratedCount} reports`,
    `Formulas added: ${formulaAddedCount} reports`,
    `Skipped: ${skippedCount} reports (already in new format or empty)`,
  ]);
}
