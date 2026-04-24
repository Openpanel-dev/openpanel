import {
  db,
  type IFlowConfig,
  queryFlowRuleMatches,
} from '@openpanel/db';
import { sendHermesFlowTrigger } from '@openpanel/integrations/src/hermes';
import { getLock } from '@openpanel/redis';

import { logger } from '../utils/logger';

const CRON_INTERVAL_MINUTES = 5;
const HERMES_BATCH_SIZE = 10_000;

type IHermesConfig = {
  type: 'hermes';
  webhookUrl: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Main Hermes flow rules cron job
 * Runs every 5 minutes, evaluates all "flow" rules and POSTs matched users to Hermes
 */
export async function hermesFlows() {
  const lock = await getLock(
    'hermesFlows:lock',
    '1',
    (CRON_INTERVAL_MINUTES - 1) * 60 * 1000,
  );
  if (!lock) {
    logger.info(
      '[hermes-flows] Skipping — another instance is already running',
    );
    return;
  }

  const rules = await db.notificationRule.findMany({
    include: { integrations: true },
  });

  const flowRules = rules.filter((rule) => {
    const cfg = rule.config as { type?: string };
    return cfg.type === 'flow';
  });

  if (flowRules.length === 0) {
    logger.debug('[hermes-flows] No flow rules found, skipping');
    return;
  }

  logger.info(`[hermes-flows] Starting evaluation of ${flowRules.length} rules`);

  const dryRun = process.env.HERMES_DRY_RUN === 'true';
  if (dryRun) {
    logger.info('[hermes-flows] DRY RUN mode — no webhooks will be called');
  }

  let evaluated = 0;
  let fired = 0;
  let skipped = 0;
  let errored = 0;

  for (const rule of flowRules) {
    try {
      const config = rule.config as unknown as IFlowConfig;

      const hermesIntegration = rule.integrations.find((i) => {
        const c = i.config as { type?: string };
        return c.type === 'hermes';
      });

      if (!hermesIntegration) {
        logger.warn(
          `[hermes-flows] Rule "${rule.name}" (${rule.id}): no Hermes integration attached — skipping`,
        );
        skipped++;
        continue;
      }

      const integrationConfig = hermesIntegration.config as unknown as IHermesConfig;

      const startedAt = Date.now();
      const userIds = await queryFlowRuleMatches({
        projectId: rule.projectId,
        config,
        cronIntervalMinutes: CRON_INTERVAL_MINUTES,
      });
      const queryMs = Date.now() - startedAt;

      evaluated++;

      if (userIds.length === 0) {
        logger.debug(
          `[hermes-flows] Rule "${rule.name}" (${rule.id}): 0 users matched (query ${queryMs}ms)`,
        );
        continue;
      }

      logger.info(
        `[hermes-flows] Rule "${rule.name}" (${rule.id}): ${userIds.length} users matched (query ${queryMs}ms)`,
      );

      const batches = chunk(userIds, HERMES_BATCH_SIZE);
      let batchOk = 0;
      let batchFail = 0;

      for (const batch of batches) {
        if (dryRun) {
          logger.info(
            `[hermes-flows] DRY RUN — would POST ${batch.length} users to ${integrationConfig.webhookUrl} for rule ${rule.id}`,
          );
          batchOk++;
          continue;
        }

        const result = await sendHermesFlowTrigger({
          webhookUrl: integrationConfig.webhookUrl,
          ruleId: rule.id,
          userIds: batch,
        });

        if (result.ok) {
          batchOk++;
          logger.info(
            `[hermes-flows] Rule "${rule.name}": batch of ${batch.length} sent (status ${result.status}, attempts ${result.attempts})`,
          );
        } else {
          batchFail++;
          logger.error(
            `[hermes-flows] Rule "${rule.name}": batch of ${batch.length} FAILED (status ${result.status}, attempts ${result.attempts})`,
          );
        }
      }

      if (batchOk > 0) {
        fired++;
        await db.notificationRule.update({
          where: { id: rule.id },
          data: { lastNotifiedAt: new Date() },
        });
      }

      if (batchFail > 0) {
        errored++;
      }
    } catch (error) {
      errored++;
      logger.error(
        `[hermes-flows] Rule "${rule.name}" (${rule.id}): error — ${error}`,
      );
    }
  }

  logger.info(
    `[hermes-flows] Done — ${flowRules.length} rules: ${evaluated} evaluated, ${fired} fired, ${skipped} skipped, ${errored} errored`,
  );
}
