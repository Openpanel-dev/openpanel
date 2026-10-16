import { db } from '../prisma-client';
import type { IChartEvent, IChartEventItem, IChartFormula } from './constants';
import { printBoxMessage, shortId } from './helpers';

export async function up() {
  printBoxMessage('🔄 Migrating Events to Series Format', []);

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

    const needsEventMigration =
      Array.isArray(events) &&
      events.length > 0 &&
      events.some(
        (event) => !event || typeof event !== 'object' || !('type' in event)
      );

    const hasFormulaInSeries =
      Array.isArray(events) &&
      events.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'formula'
      );

    const needsFormulaMigration = !!oldFormula && !hasFormulaInSeries;

    if (!(needsEventMigration || needsFormulaMigration)) {
      skippedCount++;
      continue;
    }

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
      `Updating report ${report.name} (${report.id}) with ${migratedSeries.length} series`
    );
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
