import { materializeColumnsService } from '@openpanel/db';
import { logger } from '@/utils/logger';

export async function materializeColumns(options: {
  dryRun?: boolean;
  threshold?: number;
}) {
  const { dryRun = false, threshold = 150 } = options;

  logger.info('Starting materialized columns cron job', { dryRun, threshold });

  try {
    const result = await materializeColumnsService.analyze({
      dryRun,
      threshold,
    });

    logger.info('Materialized columns analysis complete', {
      candidatesFound: result.candidates.length,
      materialized: result.materialized,
      dryRun,
    });

    // Log the report for visibility
    console.log(result.report);

    return {
      success: true,
      candidates: result.candidates.length,
      materialized: result.materialized.length,
    };
  } catch (error) {
    logger.error('Materialized columns cron job failed', { error });
    throw error;
  }
}
