import { db } from '@openpanel/db';
import { Polar } from '@polar-sh/sdk';

type PolarSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

const ACTIVE_LIKE_STATUSES: PolarSubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
];
const IGNORED_PRODUCT_IDS = new Set([
  'ac5fe58b-0a89-4851-ae41-67be34ae696f',
]);
const IGNORED_ORGANIZATION_IDS = new Set(['openpanel-dev']);

const isDryRun = process.argv.includes('--dry');
const includeCanceled = process.argv.includes('--include-canceled');
const targetSubscriptionId = getArgValue('--subscription-id');

function getArgValue(flag: string) {
  const directPrefix = `${flag}=`;
  const direct = process.argv.find((arg) => arg.startsWith(directPrefix));
  if (direct) {
    return direct.slice(directPrefix.length);
  }

  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function getServer() {
  if (process.env.POLAR_SERVER) {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox';
  }

  return process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
}

function resolveStatus(
  status: string | null | undefined,
): PolarSubscriptionStatus | null {
  if (!status) {
    return null;
  }

  const values: PolarSubscriptionStatus[] = [
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
  ];

  return values.includes(status as PolarSubscriptionStatus)
    ? (status as PolarSubscriptionStatus)
    : null;
}

function calculateSubscriptionEndsAt(subscription: {
  status: PolarSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  currentPeriodEnd: Date | null;
}) {
  if (subscription.status !== 'canceled') {
    return subscription.currentPeriodEnd;
  }

  if (subscription.cancelAtPeriodEnd) {
    return subscription.currentPeriodEnd;
  }

  return subscription.canceledAt;
}

function toComparable(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? null;
}

async function getAllSubscriptions(polar: Polar) {
  const all: Array<Awaited<ReturnType<typeof polar.subscriptions.list>>['result']['items'][number]> =
    [];
  const limit = 100;
  let page = 1;

  while (true) {
    const response = await polar.subscriptions.list({
      limit,
      page,
    });

    const items = response.result.items;
    all.push(...items);

    if (items.length < limit) {
      break;
    }

    page += 1;
  }

  return all;
}

async function main() {
  if (!process.env.POLAR_ACCESS_TOKEN) {
    throw new Error(
      'POLAR_ACCESS_TOKEN is missing. Add it to your env before running this script.',
    );
  }

  const polar = new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN,
    server: getServer(),
  });

  console.log(`Fetching subscriptions from Polar (${getServer()})...`);
  const subscriptions = targetSubscriptionId
    ? [await polar.subscriptions.get({ id: targetSubscriptionId })]
    : await getAllSubscriptions(polar);

  const scopedSubscriptions = subscriptions.filter((subscription) => {
    if (subscription.productId && IGNORED_PRODUCT_IDS.has(subscription.productId)) {
      return false;
    }

    const status = resolveStatus(subscription.status);
    if (!status) {
      return false;
    }

    if (includeCanceled) {
      return true;
    }

    return ACTIVE_LIKE_STATUSES.includes(status);
  });

  console.log(
    `Found ${subscriptions.length} total subscriptions (${scopedSubscriptions.length} in scope).`,
  );
  if (targetSubscriptionId) {
    console.log(`Filtering by subscription ID: ${targetSubscriptionId}`);
  }
  if (isDryRun) {
    console.log('Running in dry mode: no DB writes will be made.');
  }

  const productEventsLimit = new Map<string, number | null>();
  const stats = {
    updated: 0,
    unchanged: 0,
    skippedIgnoredProduct: 0,
    skippedIgnoredOrg: 0,
    skippedNoOrg: 0,
    skippedNoStatus: 0,
    failed: 0,
  };

  for (const subscription of subscriptions) {
    if (subscription.productId && IGNORED_PRODUCT_IDS.has(subscription.productId)) {
      stats.skippedIgnoredProduct += 1;
      continue;
    }

    const status = resolveStatus(subscription.status);
    if (!status) {
      stats.skippedNoStatus += 1;
      continue;
    }

    if (!includeCanceled && !ACTIVE_LIKE_STATUSES.includes(status)) {
      continue;
    }

    const metadata = (subscription.metadata ?? {}) as Record<string, unknown>;
    const metadataOrganizationId =
      typeof metadata.organizationId === 'string'
        ? metadata.organizationId
        : undefined;
    const metadataUserId =
      typeof metadata.userId === 'string' ? metadata.userId : undefined;

    if (
      metadataOrganizationId &&
      IGNORED_ORGANIZATION_IDS.has(metadataOrganizationId)
    ) {
      stats.skippedIgnoredOrg += 1;
      continue;
    }

    const organization =
      (metadataOrganizationId
        ? await db.organization.findUnique({
            where: {
              id: metadataOrganizationId,
            },
          })
        : null) ??
      (await db.organization.findFirst({
        where: {
          OR: [
            { subscriptionId: subscription.id },
            { subscriptionCustomerId: subscription.customerId },
          ],
        },
      }));

    if (!organization) {
      stats.skippedNoOrg += 1;
      console.warn(
        `Skipping ${subscription.id} (${status}) - no organization match found.`,
      );
      continue;
    }

    if (IGNORED_ORGANIZATION_IDS.has(organization.id)) {
      stats.skippedIgnoredOrg += 1;
      continue;
    }

    let subscriptionPeriodEventsLimit: number | undefined;
    if (subscription.productId) {
      if (!productEventsLimit.has(subscription.productId)) {
        const product = await polar.products.get({ id: subscription.productId });
        const eventsLimit = product.metadata?.eventsLimit;
        productEventsLimit.set(
          subscription.productId,
          typeof eventsLimit === 'number' ? eventsLimit : null,
        );
      }

      const cachedLimit = productEventsLimit.get(subscription.productId);
      if (typeof cachedLimit === 'number') {
        const shouldPreserveHigherExistingYearlyLimit =
          subscription.recurringInterval === 'year' &&
          typeof organization.subscriptionPeriodEventsLimit === 'number' &&
          organization.subscriptionPeriodEventsLimit > cachedLimit;

        subscriptionPeriodEventsLimit = shouldPreserveHigherExistingYearlyLimit
          ? organization.subscriptionPeriodEventsLimit
          : cachedLimit;
      }
    }

    const data = {
      subscriptionId: subscription.id,
      subscriptionCustomerId: subscription.customerId,
      subscriptionPriceId: subscription.prices[0]?.id ?? null,
      subscriptionProductId: subscription.productId,
      subscriptionStatus: status,
      subscriptionStartsAt: subscription.currentPeriodStart,
      subscriptionCanceledAt: subscription.canceledAt,
      subscriptionEndsAt: calculateSubscriptionEndsAt({
        status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
      }),
      subscriptionCreatedByUserId:
        metadataUserId ?? organization.subscriptionCreatedByUserId,
      subscriptionInterval: subscription.recurringInterval,
      subscriptionPeriodEventsLimit:
        subscriptionPeriodEventsLimit ?? organization.subscriptionPeriodEventsLimit,
      subscriptionPeriodEventsCountExceededAt:
        typeof subscriptionPeriodEventsLimit === 'number' &&
        organization.subscriptionPeriodEventsCountExceededAt &&
        organization.subscriptionPeriodEventsLimit < subscriptionPeriodEventsLimit
          ? null
          : undefined,
    };

    const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
    const fieldsToCompare = [
      'subscriptionId',
      'subscriptionCustomerId',
      'subscriptionPriceId',
      'subscriptionProductId',
      'subscriptionStatus',
      'subscriptionStartsAt',
      'subscriptionCanceledAt',
      'subscriptionEndsAt',
      'subscriptionCreatedByUserId',
      'subscriptionInterval',
      'subscriptionPeriodEventsLimit',
    ] as const;

    for (const field of fieldsToCompare) {
      const from = toComparable(organization[field]);
      const to = toComparable(data[field]);
      if (from !== to) {
        changes.push({ field, from, to });
      }
    }

    const unchanged = changes.length === 0;

    if (unchanged) {
      stats.unchanged += 1;
      if (isDryRun) {
        console.log(
          `[dry] No changes for organization ${organization.id} from subscription ${subscription.id}.`,
        );
      }
      continue;
    }

    try {
      if (isDryRun) {
        console.log(
          `[dry] Changes for organization ${organization.id} from subscription ${subscription.id}:`,
        );
        for (const change of changes) {
          console.log(`  - ${change.field}:`, change.from, '=>', change.to);
        }
      }

      if (!isDryRun) {
        await db.organization.update({
          where: {
            id: organization.id,
          },
          data,
        });
      }
      stats.updated += 1;
      console.log(
        `${isDryRun ? '[dry] ' : ''}Synced organization ${organization.id} from subscription ${subscription.id} (${status}).`,
      );
    } catch (error) {
      stats.failed += 1;
      console.error(
        `Failed syncing organization ${organization.id} from subscription ${subscription.id}:`,
        error,
      );
    }
  }

  console.log('\nSync complete:');
  console.table(stats);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
