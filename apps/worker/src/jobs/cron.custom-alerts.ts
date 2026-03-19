import {
  type AlertFrequency,
  ALERT_FREQUENCY_MS,
  ALERT_FREQUENCY_TO_CURRENT_RANGE,
  ALERT_FREQUENCY_TO_INTERVAL,
  ALERT_FREQUENCY_TO_RANGE,
  ANOMALY_HISTORY_COUNT,
  CONFIDENCE_Z_SCORES,
} from '@openpanel/constants';
import {
  ChartEngine,
  conversionService,
  createNotification,
  db,
  funnelService,
  getDatesFromRange,
  getReportById,
  getSettingsForProject,
} from '@openpanel/db';

import { logger } from '../utils/logger';

// Inline types — @openpanel/validation is not a direct worker dependency
type INotificationRuleThresholdConfig = {
  type: 'threshold';
  reportId: string;
  operator: 'above' | 'below';
  value: number;
  frequency: AlertFrequency;
};

type INotificationRuleAnomalyConfig = {
  type: 'anomaly';
  reportId: string;
  confidence: '95' | '98' | '99';
  frequency: AlertFrequency;
};

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
          organizationId: true,
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

      // Build dashboard link scoped to the alert's evaluation window
      const dashboardUrl =
        process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL;
      const organizationId = rule.project?.organizationId;
      const alertRange = ALERT_FREQUENCY_TO_CURRENT_RANGE[config.frequency as AlertFrequency];
      const reportLink =
        dashboardUrl && organizationId
          ? `${dashboardUrl}/${organizationId}/${rule.projectId}/reports/${config.reportId}?range=${alertRange}`
          : '';

      // Build rich notification message
      const projectName = rule.project?.name || '';
      const now = new Date();
      const timeStr = now.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

      const lines = [message];
      if (reportLink) {
        lines.push(`Report: ${reportLink}`);
      }
      lines.push(`Time: ${timeStr}`);
      if (projectName) {
        lines.push(`Project: ${projectName}`);
      }
      const fullMessage = lines.join('\n');

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
  const freq = config.frequency;
  const interval = ALERT_FREQUENCY_TO_INTERVAL[freq];

  // Conversion charts: use conversionService to get the actual conversion rate (%)
  if (report.chartType === 'conversion') {
    const { timezone } = await getSettingsForProject(report.projectId);
    const { startDate, endDate } = getDatesFromRange(
      ALERT_FREQUENCY_TO_CURRENT_RANGE[freq] as any,
      timezone,
    );

    const series = await conversionService.getConversion({
      projectId: report.projectId,
      startDate,
      endDate,
      series: report.series,
      breakdowns: report.breakdowns,
      interval: interval as any,
      timezone,
      funnelGroup: report.funnelGroup,
      funnelWindow: report.funnelWindow,
      globalFilters: report.globalFilters,
      holdProperties: report.holdProperties,
      measuring: 'conversion_rate',
      limit: report.limit,
      cohortFilters: report.cohortFilters,
    });

    const data = series[0]?.data ?? [];
    const lastPoint = data[data.length - 1];
    const currentValue = lastPoint?.rate ?? 0;

    const crossed =
      config.operator === 'above'
        ? currentValue > config.value
        : currentValue < config.value;

    return {
      shouldAlert: crossed,
      currentValue,
      title: `Alert: ${report.name}`,
      message: `The current value for ${report.name} is ${currentValue.toFixed(2)}%. Triggered when the current value is ${config.operator} ${config.value}%.`,
    };
  }

  // Funnel charts: use funnelService to get the overall conversion % from the last step
  if (report.chartType === 'funnel') {
    const { timezone } = await getSettingsForProject(report.projectId);
    const { startDate, endDate } = getDatesFromRange(
      ALERT_FREQUENCY_TO_CURRENT_RANGE[freq] as any,
      timezone,
    );

    const funnelResult = await funnelService.getFunnel({
      projectId: report.projectId,
      startDate,
      endDate,
      series: report.series,
      breakdowns: report.breakdowns,
      interval: interval as any,
      range: report.range,
      chartType: report.chartType,
      metric: report.metric as any,
      previous: false,
      timezone,
      funnelGroup: report.funnelGroup,
      funnelWindow: report.funnelWindow,
      globalFilters: report.globalFilters,
      holdProperties: report.holdProperties,
      measuring: 'conversion_rate',
      limit: report.limit,
      cohortFilters: report.cohortFilters,
    });

    const currentValue = funnelResult[0]?.lastStep?.percent ?? 0;

    const crossed =
      config.operator === 'above'
        ? currentValue > config.value
        : currentValue < config.value;

    return {
      shouldAlert: crossed,
      currentValue,
      title: `Alert: ${report.name}`,
      message: `The current value for ${report.name} is ${currentValue.toFixed(2)}%. Triggered when the current value is ${config.operator} ${config.value}%.`,
    };
  }

  // All other chart types: use ChartEngine with raw metric values
  const range = ALERT_FREQUENCY_TO_CURRENT_RANGE[freq];

  const result = await ChartEngine.execute({
    projectId: report.projectId,
    series: report.series,
    breakdowns: report.breakdowns,
    chartType: report.chartType,
    interval: interval as any,
    range: range as any,
    previous: false,
    formula: report.formula,
    metric: report.metric as any,
    globalFilters: report.globalFilters,
    holdProperties: report.holdProperties,
    measuring: 'conversion_rate',
    limit: report.limit,
    cohortFilters: report.cohortFilters,
  });

  const currentValue = result.series[0]?.metrics?.sum ?? 0;
  const metricKey = (report.metric as string) || 'sum';
  const metricValue =
    (result.series[0]?.metrics as unknown as Record<string, number>)?.[metricKey] ??
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
  const freq = config.frequency;
  const historicalRange = ALERT_FREQUENCY_TO_RANGE[freq];
  const interval = ALERT_FREQUENCY_TO_INTERVAL[freq];

  // Conversion charts: use conversionService and compare on rate (%) not raw counts
  if (report.chartType === 'conversion') {
    const { timezone } = await getSettingsForProject(report.projectId);
    const { startDate, endDate } = getDatesFromRange(historicalRange as any, timezone);

    const seriesResult = await conversionService.getConversion({
      projectId: report.projectId,
      startDate,
      endDate,
      series: report.series,
      breakdowns: report.breakdowns,
      interval: interval as any,
      timezone,
      funnelGroup: report.funnelGroup,
      funnelWindow: report.funnelWindow,
      globalFilters: report.globalFilters,
      holdProperties: report.holdProperties,
      measuring: 'conversion_rate',
      limit: report.limit,
      cohortFilters: report.cohortFilters,
    });

    const data = seriesResult[0]?.data ?? [];
    if (data.length < 3) {
      logger.warn(
        `Not enough historical data for anomaly detection on report ${report.id}`,
      );
      return { shouldAlert: false, currentValue: 0, lowerBound: 0, upperBound: 0, title: '', message: '' };
    }

    // dataPoints are conversion rates (percentages, e.g. 88.63)
    const dataPoints = data.map((d) => d.rate);
    const historicalValues = dataPoints.slice(
      0,
      Math.min(dataPoints.length - 1, ANOMALY_HISTORY_COUNT),
    );
    const currentValue = dataPoints[dataPoints.length - 1] ?? 0;

    if (historicalValues.length < 3) {
      return { shouldAlert: false, currentValue: 0, lowerBound: 0, upperBound: 0, title: '', message: '' };
    }

    const mean = historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
    const variance =
      historicalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
      historicalValues.length;
    const stddev = Math.sqrt(variance);

    const zScore = CONFIDENCE_Z_SCORES[config.confidence] ?? 1.96;
    const lowerBound = mean - zScore * stddev;
    const upperBound = mean + zScore * stddev;
    const isAnomaly = currentValue < lowerBound || currentValue > upperBound;

    return {
      shouldAlert: isAnomaly,
      currentValue,
      lowerBound,
      upperBound,
      title: `Alert: ${report.name}`,
      message: `The current value for ${report.name} is ${currentValue.toFixed(2)}%. Triggered when the current value is not within forecasted range [${lowerBound.toFixed(2)}%, ${upperBound.toFixed(2)}%].`,
    };
  }

  // Funnel charts: no time-series data available — anomaly detection not supported
  if (report.chartType === 'funnel') {
    logger.warn(
      `[custom-alerts] Anomaly detection is not supported for funnel charts (report ${report.id}) — skipping`,
    );
    return { shouldAlert: false, currentValue: 0, lowerBound: 0, upperBound: 0, title: '', message: '' };
  }

  // All other chart types: use ChartEngine with raw counts
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
    globalFilters: report.globalFilters,
    holdProperties: report.holdProperties,
    measuring: 'conversion_rate',
    limit: report.limit,
    cohortFilters: report.cohortFilters,
  });

  const series = result.series[0];
  if (!series || !series.data || series.data.length < 3) {
    logger.warn(
      `Not enough historical data for anomaly detection on report ${report.id}`,
    );
    return { shouldAlert: false, currentValue: 0, lowerBound: 0, upperBound: 0, title: '', message: '' };
  }

  const dataPoints = series.data.map((d) => d.count);
  const historicalValues = dataPoints.slice(
    0,
    Math.min(dataPoints.length - 1, ANOMALY_HISTORY_COUNT),
  );
  const currentValue = dataPoints[dataPoints.length - 1] ?? 0;

  if (historicalValues.length < 3) {
    return { shouldAlert: false, currentValue: 0, lowerBound: 0, upperBound: 0, title: '', message: '' };
  }

  const mean =
    historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
  const variance =
    historicalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
    historicalValues.length;
  const stddev = Math.sqrt(variance);

  const zScore = CONFIDENCE_Z_SCORES[config.confidence] ?? 1.96;
  const lowerBound = mean - zScore * stddev;
  const upperBound = mean + zScore * stddev;
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
