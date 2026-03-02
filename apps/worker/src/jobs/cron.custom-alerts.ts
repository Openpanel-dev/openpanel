import {
  ALERT_FREQUENCY_MS,
  ALERT_FREQUENCY_TO_CURRENT_RANGE,
  ALERT_FREQUENCY_TO_INTERVAL,
  ALERT_FREQUENCY_TO_RANGE,
  ANOMALY_HISTORY_COUNT,
  CONFIDENCE_Z_SCORES,
} from '@openpanel/constants';
import {
  ChartEngine,
  createNotification,
  db,
  getReportById,
} from '@openpanel/db';
import type {
  INotificationRuleAnomalyConfig,
  INotificationRuleThresholdConfig,
} from '@openpanel/validation';

import { logger } from '../utils/logger';

/**
 * Main custom alerts cron job
 * Runs every 15 minutes, evaluates all threshold and anomaly rules
 */
export async function customAlerts() {
  const rules = await db.notificationRule.findMany({
    where: {
      config: {
        path: ['type'],
        string_contains: '', // We'll filter in code since Prisma JSON filtering is limited
      },
    },
    include: {
      integrations: true,
      project: {
        select: {
          name: true,
        },
      },
    },
  });

  // Filter to only threshold and anomaly rules
  const alertRules = rules.filter((rule) => {
    const config = rule.config as { type?: string };
    return config.type === 'threshold' || config.type === 'anomaly';
  });

  if (alertRules.length === 0) {
    logger.debug('No custom alert rules found, skipping');
    return;
  }

  logger.info(`[custom-alerts] Starting evaluation of ${alertRules.length} rules`);

  let evaluated = 0;
  let skippedFrequency = 0;
  let skippedNotCrossed = 0;
  let triggered = 0;
  let errored = 0;

  for (const rule of alertRules) {
    try {
      const config = rule.config as
        | INotificationRuleThresholdConfig
        | INotificationRuleAnomalyConfig;

      // Frequency check: skip if not enough time has elapsed
      if (rule.lastNotifiedAt) {
        const elapsed = Date.now() - rule.lastNotifiedAt.getTime();
        if (elapsed < ALERT_FREQUENCY_MS[config.frequency]) {
          skippedFrequency++;
          logger.debug(
            `[custom-alerts] Rule "${rule.name}" (${rule.id}): skipped — frequency limit not elapsed (${Math.round(elapsed / 1000 / 60)}min / ${config.frequency})`,
          );
          continue;
        }
      }

      // Fetch the report this alert is tied to
      const report = await getReportById(config.reportId);
      if (!report) {
        logger.warn(
          `[custom-alerts] Rule "${rule.name}" (${rule.id}): report ${config.reportId} not found — skipping`,
        );
        errored++;
        continue;
      }

      evaluated++;
      let shouldAlert = false;
      let title = '';
      let message = '';

      if (config.type === 'threshold') {
        const result = await evaluateThreshold(report, config);
        shouldAlert = result.shouldAlert;
        title = result.title;
        message = result.message;

        logger.info(
          `[custom-alerts] Rule "${rule.name}" (${rule.id}): threshold ${config.operator} ${config.value} — current: ${result.currentValue} — ${shouldAlert ? 'TRIGGERED' : 'not crossed'}`,
        );
      } else if (config.type === 'anomaly') {
        const result = await evaluateAnomaly(report, config);
        shouldAlert = result.shouldAlert;
        title = result.title;
        message = result.message;

        logger.info(
          `[custom-alerts] Rule "${rule.name}" (${rule.id}): anomaly ${config.confidence}% — current: ${result.currentValue} — band: [${result.lowerBound}, ${result.upperBound}] — ${shouldAlert ? 'TRIGGERED' : 'within range'}`,
        );
      }

      if (!shouldAlert) {
        skippedNotCrossed++;
        continue;
      }

      triggered++;

      // Send notifications to all integrations
      const projectName = rule.project?.name || '';
      const fullMessage = projectName
        ? `${message}\nProject: ${projectName}`
        : message;

      const integrationCount = rule.integrations.length + (rule.sendToApp ? 1 : 0);
      logger.info(
        `[custom-alerts] Rule "${rule.name}" (${rule.id}): sending ${integrationCount} notification(s)`,
      );

      const promises = rule.integrations.map((integration) =>
        createNotification({
          title,
          message: fullMessage,
          projectId: rule.projectId,
          integrationId: integration.id,
          notificationRuleId: rule.id,
          payload: null,
        }),
      );

      if (rule.sendToApp) {
        promises.push(
          createNotification({
            title,
            message: fullMessage,
            projectId: rule.projectId,
            integrationId: 'app',
            notificationRuleId: rule.id,
            payload: null,
          }),
        );
      }

      await Promise.all(promises);

      // Update lastNotifiedAt
      await db.notificationRule.update({
        where: { id: rule.id },
        data: { lastNotifiedAt: new Date() },
      });

      logger.info(
        `[custom-alerts] Rule "${rule.name}" (${rule.id}): lastNotifiedAt updated`,
      );
    } catch (error) {
      errored++;
      logger.error(
        `[custom-alerts] Rule "${rule.name}" (${rule.id}): error — ${error}`,
      );
    }
  }

  logger.info(
    `[custom-alerts] Done — ${alertRules.length} rules: ${evaluated} evaluated, ${triggered} triggered, ${skippedFrequency} skipped (frequency), ${skippedNotCrossed} skipped (not crossed), ${errored} errored`,
  );
}

/**
 * Evaluate a threshold alert rule
 * Runs the report query for the current frequency window and compares against the fixed threshold
 */
async function evaluateThreshold(
  report: NonNullable<Awaited<ReturnType<typeof getReportById>>>,
  config: INotificationRuleThresholdConfig,
) {
  const range = ALERT_FREQUENCY_TO_CURRENT_RANGE[config.frequency];

  const result = await ChartEngine.execute({
    projectId: report.projectId,
    series: report.series,
    breakdowns: report.breakdowns,
    chartType: report.chartType,
    interval: ALERT_FREQUENCY_TO_INTERVAL[config.frequency] as any,
    range: range as any,
    previous: false,
    formula: report.formula,
    metric: report.metric as any,
  });

  // Get the primary metric value from the first series
  const currentValue = result.series[0]?.metrics?.sum ?? 0;
  const metricKey = (report.metric as string) || 'sum';
  const metricValue =
    (result.series[0]?.metrics as Record<string, number>)?.[metricKey] ??
    currentValue;

  const crossed =
    config.operator === 'above'
      ? metricValue > config.value
      : metricValue < config.value;

  return {
    shouldAlert: crossed,
    currentValue: metricValue,
    title: `Alert: ${report.name}`,
    message: `The current value for ${report.name} is ${metricValue.toFixed(2)}. Triggered when the current value is ${config.operator} ${config.value}.`,
  };
}

/**
 * Evaluate an anomaly detection alert rule
 * Runs the report query for historical periods, computes confidence band, checks if current value is outside
 */
async function evaluateAnomaly(
  report: NonNullable<Awaited<ReturnType<typeof getReportById>>>,
  config: INotificationRuleAnomalyConfig,
) {
  const historicalRange = ALERT_FREQUENCY_TO_RANGE[config.frequency];
  const interval = ALERT_FREQUENCY_TO_INTERVAL[config.frequency];

  // Fetch historical data with enough range to get ANOMALY_HISTORY_COUNT data points
  const result = await ChartEngine.execute({
    projectId: report.projectId,
    series: report.series,
    breakdowns: report.breakdowns,
    chartType: report.chartType,
    interval: interval as any,
    range: historicalRange as any,
    previous: false,
    formula: report.formula,
    metric: report.metric as any,
  });

  const series = result.series[0];
  if (!series || !series.data || series.data.length < 3) {
    logger.warn(
      `Not enough historical data for anomaly detection on report ${report.id}`,
    );
    return { shouldAlert: false, currentValue: 0, lowerBound: 0, upperBound: 0, title: '', message: '' };
  }

  // Extract historical values (all but the last point) and current value (last point)
  const dataPoints = series.data.map((d) => d.count);
  const historicalValues = dataPoints.slice(
    0,
    Math.min(dataPoints.length - 1, ANOMALY_HISTORY_COUNT),
  );
  const currentValue = dataPoints[dataPoints.length - 1] ?? 0;

  if (historicalValues.length < 3) {
    return { shouldAlert: false, currentValue: 0, lowerBound: 0, upperBound: 0, title: '', message: '' };
  }

  // Compute mean and standard deviation
  const mean =
    historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
  const variance =
    historicalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
    historicalValues.length;
  const stddev = Math.sqrt(variance);

  // Get Z-score for confidence level
  const zScore = CONFIDENCE_Z_SCORES[config.confidence] ?? 1.96;

  // Compute confidence band
  const lowerBound = mean - zScore * stddev;
  const upperBound = mean + zScore * stddev;

  // Check if current value is outside the band
  const isAnomaly = currentValue < lowerBound || currentValue > upperBound;

  return {
    shouldAlert: isAnomaly,
    currentValue,
    lowerBound,
    upperBound,
    title: `Alert: ${report.name}`,
    message: `The current value for ${report.name} is ${currentValue.toFixed(2)}. Triggered when the current value is not within forecasted range [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}].`,
  };
}
