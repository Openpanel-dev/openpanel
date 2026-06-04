import { db } from '../index';
import { printBoxMessage } from './helpers';

export async function up() {
  printBoxMessage('🔄 Migrating deprecated report.range values', []);

  const updated = await db.$executeRaw`
    UPDATE reports
    SET range = '30d'
    WHERE range IN ('1h', '24h', '14d', '1m', '3m', '1y')
  `;

  printBoxMessage('✅ Migration Complete', [`Updated: ${updated} reports`]);
}
