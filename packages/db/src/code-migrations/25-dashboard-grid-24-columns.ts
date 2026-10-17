/**
 * Move dashboard layouts from the 12 × 100px grid to 24 columns × 42px rows.
 *
 * With the 16px gap, two 42px rows are exactly as tall as one 100px row, and
 * two of 24 columns exactly as wide as one of 12, so doubling every stored
 * position and size keeps each tile where it was, to the pixel.
 *
 * Only rows still marked `gridColumns = 12` are doubled, and they are marked
 * 24 in the same statement. A re-run changes nothing, and a tile saved on the
 * new grid before this ran is never doubled.
 *
 *   pnpm with-env jiti ./src/code-migrations/25-dashboard-grid-24-columns.ts --dry
 */
import { db } from '../prisma-client';
import { getIsDry, printBoxMessage } from './helpers';

const OLD_GRID_COLUMNS = 12;
const NEW_GRID_COLUMNS = 24;

export async function up() {
  const oldLayouts = await db.reportLayout.count({
    where: { gridColumns: OLD_GRID_COLUMNS },
  });

  printBoxMessage('📋 Plan', [
    `Layouts on the ${OLD_GRID_COLUMNS}-column grid: ${oldLayouts}`,
    'x, y, w, h and the min/max sizes are doubled for the 24-column grid',
  ]);

  if (oldLayouts === 0) {
    printBoxMessage('✅ Nothing to do', [
      `No layouts left on the ${OLD_GRID_COLUMNS}-column grid`,
    ]);
    return;
  }

  if (getIsDry()) {
    printBoxMessage('🕒 Dry run - nothing written', [
      `Would double ${oldLayouts} layout(s)`,
    ]);
    return;
  }

  const updated = await db.$executeRaw`
    UPDATE report_layouts
    SET x = x * 2, y = y * 2, w = w * 2, h = h * 2,
        "minW" = "minW" * 2, "minH" = "minH" * 2,
        "maxW" = "maxW" * 2, "maxH" = "maxH" * 2,
        "gridColumns" = ${NEW_GRID_COLUMNS}
    WHERE "gridColumns" = ${OLD_GRID_COLUMNS}`;

  printBoxMessage('✅ Done', [`Doubled ${updated} layout(s)`]);
}
