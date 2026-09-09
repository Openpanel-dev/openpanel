// Moved from packages/db/src/services/notification.service.ts (M6-005,
// ADR-008's module map: "rules + dispatch stay together"). The delivery body
// moves here too, from apps/worker/src/jobs/notification.ts (DELEGATE
// PATTERN: that file becomes a thin wrapper calling `deliverNotification`).
//
// `createNotification` / `triggerNotification` / `checkNotificationRulesForEvent`
// / `checkNotificationRulesForSessionEnd` — the BullMQ-producer orchestration
// around a rule match — live in this module's own `src/notification-dispatch.ts`
// since M11-003, built on the rule matching, templates, cache and constants
// exported below. They are a separate file only so the enqueue side is not
// dragged into every import of this one.
//
// db/ch access is LAZY (`load*` below), not a static top-level import — see
// insight.service.ts's header for the full reasoning (jobs.registry.ts and
// services.ts pull this module into the eager barrel chain nearly every core
// test file reaches, and constructing @openpanel/db's clients at import time
// would spawn a pino-pretty transport worker thread per test file).

import type { Integration, Prisma } from '@openpanel/db/src/prisma-client';
import { pathOr } from 'ramda';
import { cacheablePerDeps } from '../../cacheable-per-deps';
import { sendEmail } from '../../clients/email';
import { TRPCBadRequestError, TRPCForbiddenError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import { stripLeadingAndTrailingSlashes } from '../../shared/string';
import type {
  IServiceCreateEventPayload,
  IServiceEvent,
} from '../event/event.service';
import {
  type IIntegrationConfig,
  isKind,
} from '../integration/integration.constants';
import { getServerIntegration } from '../integration/src/registry';
import type {
  IChartEvent,
  IChartEventFilter,
} from '../report/report.constants';

/** Lazy: `context.ts` value-imports `services.ts`, so a static import here
 *  would put the whole service graph in this module's import graph — and this
 *  module is part of that graph. */
function loadPrismaSentinels() {
  return import('../../context').then((m) => m.prismaSentinels());
}

import type { ICreateNotificationRule } from './notification.constants';

export const APP_NOTIFICATION_INTEGRATION_ID = 'app';
export const EMAIL_NOTIFICATION_INTEGRATION_ID = 'email';

export const BASE_INTEGRATIONS: Integration[] = [
  {
    id: APP_NOTIFICATION_INTEGRATION_ID,
    name: 'Website',
    createdAt: new Date(),
    updatedAt: new Date(),
    config: { type: APP_NOTIFICATION_INTEGRATION_ID },
    organizationId: '',
    projectId: null,
  },
  {
    id: EMAIL_NOTIFICATION_INTEGRATION_ID,
    name: 'Email',
    createdAt: new Date(),
    updatedAt: new Date(),
    config: { type: EMAIL_NOTIFICATION_INTEGRATION_ID },
    organizationId: '',
    projectId: null,
  },
];

export const isBaseIntegration = (id: string) =>
  BASE_INTEGRATIONS.find((integration) => integration.id === id);

export type INotificationPayload =
  | { type: 'event'; event: IServiceCreateEventPayload }
  | { type: 'funnel'; funnel: IServiceEvent[] };

// M15-004: `getNotificationRulesByProjectId` is `cacheablePerDeps` — `cacheable`
// keys on the call's ARGUMENTS (packages/redis/cachable.ts), so the caller's
// deps travel beside the key rather than inside it and the Redis key stays
// byte-identical. Every function in this file now reads `deps.db`.

// -- Rule cache --------------------------------------------------------

export type INotificationRuleCached = Awaited<
  ReturnType<typeof getNotificationRulesByProjectId>
>[number];

export const getNotificationRulesByProjectId = cacheablePerDeps(
  'getNotificationRulesByProjectId',
  (deps: ServiceDeps, projectId: string) =>
    deps.db.notificationRule.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        sendToApp: true,
        sendToEmail: true,
        config: true,
        template: true,
        integrations: { select: { id: true } },
      },
    }),
  60 * 24,
  { cacheEmptyArray: true }
);

// -- Rule matching (pure) -----------------------------------------------

export function matchEventFilters(
  payload: IServiceCreateEventPayload,
  filters: IChartEventFilter[]
): boolean {
  return filters.every((filter) => {
    const { name, value, operator } = filter;

    if (value.length === 0) {
      return true;
    }

    if (name === 'has_profile') {
      if (value.includes('true')) {
        return payload.profileId !== payload.deviceId;
      }
      return payload.profileId === payload.deviceId;
    }

    const propertyValue = (
      name.startsWith('properties.')
        ? pathOr('', name.split('.'), payload)
        : pathOr('', [name], payload)
    ).trim();

    switch (operator) {
      case 'is':
        return value.includes(propertyValue);
      case 'isNot':
        return !value.includes(propertyValue);
      case 'contains':
        return value.some((val) => propertyValue.includes(String(val)));
      case 'doesNotContain':
        return !value.some((val) => propertyValue.includes(String(val)));
      case 'startsWith':
        return value.some((val) => propertyValue.startsWith(String(val)));
      case 'endsWith':
        return value.some((val) => propertyValue.endsWith(String(val)));
      case 'regex': {
        return value
          .map((val) => stripLeadingAndTrailingSlashes(String(val)))
          .some((val) => {
            try {
              return new RegExp(val).test(propertyValue);
            } catch {
              return false;
            }
          });
      }
      case 'isNull':
        return propertyValue === '';
      case 'isNotNull':
        return propertyValue !== '';
      case 'gt':
        return value.some((val) => Number(propertyValue) > Number(val));
      case 'lt':
        return value.some((val) => Number(propertyValue) < Number(val));
      case 'gte':
        return value.some((val) => Number(propertyValue) >= Number(val));
      case 'lte':
        return value.some((val) => Number(propertyValue) <= Number(val));
      default:
        return false;
    }
  });
}

export function matchEvent(
  payload: IServiceCreateEventPayload,
  chartEvent: IChartEvent
): boolean {
  if (payload.name !== chartEvent.name && chartEvent.name !== '*') {
    return false;
  }

  if (chartEvent.filters.length > 0) {
    return matchEventFilters(payload, chartEvent.filters);
  }

  return true;
}

const isFunnelRule = (rule: INotificationRuleCached) =>
  rule.config.type === 'funnel';

export function getHasFunnelRules(rules: INotificationRuleCached[]): boolean {
  return rules.some(isFunnelRule);
}

export function getFunnelRules(
  rules: INotificationRuleCached[]
): INotificationRuleCached[] {
  return rules.filter(isFunnelRule);
}

// -- Templates (pure) -----------------------------------------------------

export function notificationTemplateEvent({
  payload,
  rule,
}: {
  payload: IServiceCreateEventPayload;
  rule: INotificationRuleCached;
}): string {
  if (!rule.template) {
    return `You received a new "${payload.name}" event`;
  }
  let template = rule.template
    .replaceAll('$EVENT_NAME', payload.name)
    .replaceAll('$RULE_NAME', rule.name)
    .replaceAll('{{rule_name}}', rule.name);

  const placeholderMatches = template.match(/{{[^}]+}}/g) || [];
  for (const match of placeholderMatches) {
    const path = match.slice(2, -2);
    const value = pathOr('', path.split('.'), payload);

    if (value) {
      template = template.replaceAll(
        match,
        typeof value === 'object' ? JSON.stringify(value) : value
      );
    }
  }

  return template;
}

export function notificationTemplateFunnel({
  events,
  rule,
}: {
  events: IServiceEvent[];
  rule: INotificationRuleCached;
}): string {
  if (!rule.template) {
    return `Funnel "${rule.name}" completed`;
  }
  return rule.template
    .replaceAll('$EVENT_NAME', events.map((e) => e.name).join(' -> '))
    .replaceAll('$RULE_NAME', rule.name);
}

// -- Dispatch (the delivery job body) --------------------------------------

/**
 * `Prisma.JsonNull`/`Prisma.DbNull` sentinels don't narrow away from a union
 * through plain `!==` control flow — an explicit type predicate is what makes
 * `payload` usable as `INotificationPayload` afterward.
 */
function isValidPayload<T>(
  value: T | Prisma.NullableJsonNullValueInput | null | undefined,
  jsonNull: unknown,
  dbNull: unknown
): value is T {
  return (
    value !== null &&
    value !== undefined &&
    value !== jsonNull &&
    value !== dbNull
  );
}

/** apps/worker/src/jobs/notification.ts's `sendNotification` job body. */
/** Where a notification email links when DASHBOARD_URL is not set. */
const DEFAULT_DASHBOARD_URL = 'https://dashboard.openpanel.dev';

export async function deliverNotification(
  deps: ServiceDeps,
  notification: Prisma.NotificationUncheckedCreateInput
): Promise<unknown> {
  const db = deps.db;

  // App + email are pseudo-integrations dispatched by flags, not real rows.
  // Lazy: @openpanel/redis is otherwise pulled in eagerly through this
  // module's place in the barrel (services.ts, jobs.registry.ts), and a
  // static import here would demand `publishEvent` from every core test
  // file's `@openpanel/redis` mock, not just this module's own.
  if (notification.sendToApp) {
    const { publishEvent } = await import('@openpanel/redis');
    publishEvent('notification', 'created', notification);
    return;
  }

  if (notification.sendToEmail) {
    const project = await db.project.findUniqueOrThrow({
      where: { id: notification.projectId },
      select: { name: true, organizationId: true },
    });
    const members = await db.member.findMany({
      where: {
        organizationId: project.organizationId,
        user: { deletedAt: null },
      },
      include: { user: { select: { email: true } } },
    });
    const emails = new Set(
      members.flatMap((member) =>
        member.user?.email ? [member.user.email] : []
      )
    );
    for (const to of emails) {
      // Per-recipient unsubscribe (product_alerts category) is handled
      // inside sendEmail.
      await sendEmail('notification-rule', {
        to,
        data: {
          title: notification.title,
          message: notification.message,
          projectName: project.name,
          dashboardUrl: `${deps.config.dashboardUrl || DEFAULT_DASHBOARD_URL}/${project.organizationId}/${notification.projectId}`,
        },
      });
    }
    return;
  }

  if (!notification.integrationId) {
    throw new Error('No integrationId provided');
  }

  const integration = await db.integration.findUniqueOrThrow({
    where: { id: notification.integrationId },
  });

  const payload = notification.payload;
  const PrismaRuntime = await loadPrismaSentinels();
  if (
    !isValidPayload<INotificationPayload>(
      payload,
      PrismaRuntime.JsonNull,
      PrismaRuntime.DbNull
    )
  ) {
    return new Error('Invalid payload');
  }

  const config = integration.config as IIntegrationConfig | null;
  // An integration whose config is still empty (e.g. a Slack integration
  // before its OAuth callback fills the config) has no type yet — nothing
  // to deliver to.
  if (!config?.type) {
    return;
  }

  // Generic registry dispatch — no per-type switch. A new notification
  // integration just registers a `notification.deliver` plugin.
  const plugin = getServerIntegration(config.type);
  if (!plugin.notification) {
    throw new Error(`Integration ${config.type} is not a notification sink`);
  }

  return plugin.notification.deliver({
    config,
    notification: {
      title: notification.title,
      message: notification.message,
    },
    payload,
  });
}

// -- RPC-facing CRUD --------------------------------------------------------

export function listNotifications(deps: ServiceDeps, projectId: string) {
  return Promise.resolve(deps.db).then((db) =>
    db.notification.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        integration: { select: { name: true } },
        notificationRule: { select: { name: true } },
      },
      take: 5000,
    })
  );
}

export async function listNotificationRules(
  deps: ServiceDeps,
  projectId: string
) {
  const db = deps.db;
  const rules = await db.notificationRule.findMany({
    where: { projectId },
    include: { integrations: true },
    orderBy: { createdAt: 'desc' },
  });

  return rules.map((rule) => ({
    ...rule,
    integrations: [
      ...BASE_INTEGRATIONS.filter(
        (integration) =>
          (integration.id === APP_NOTIFICATION_INTEGRATION_ID &&
            rule.sendToApp) ||
          (integration.id === EMAIL_NOTIFICATION_INTEGRATION_ID &&
            rule.sendToEmail)
      ),
      ...rule.integrations,
    ],
  }));
}

export async function getNotificationRuleByIdOrThrow(
  deps: ServiceDeps,
  id: string
) {
  return await deps.db.notificationRule.findUniqueOrThrow({ where: { id } });
}

/**
 * Authorization (`requireProjectAccess`) is the caller's job — same split as
 * reference.service.ts. This validates that every connected integration
 * belongs to `input.projectId` or is a legacy org-wide one in the same org,
 * then writes the rule.
 */
export async function createOrUpdateNotificationRule(
  deps: ServiceDeps,
  input: ICreateNotificationRule
) {
  const db = deps.db;
  const project = await db.project.findUniqueOrThrow({
    where: { id: input.projectId },
    select: { organizationId: true },
  });

  const integrationIds = input.integrations.filter(
    (id) => !isBaseIntegration(id)
  );
  if (integrationIds.length > 0) {
    const integrations = await db.integration.findMany({
      where: { id: { in: integrationIds } },
      select: {
        id: true,
        projectId: true,
        organizationId: true,
        config: true,
      },
    });
    if (integrations.length !== integrationIds.length) {
      throw new TRPCBadRequestError('One or more integrations were not found');
    }
    for (const integration of integrations) {
      const sameProject = integration.projectId === input.projectId;
      const orgWideSameOrg =
        integration.projectId === null &&
        integration.organizationId === project.organizationId;
      if (!(sameProject || orgWideSameOrg)) {
        throw new TRPCForbiddenError(
          'Integration does not belong to this project'
        );
      }
      // Export-only integrations (s3_export, gcs_export) have no
      // notification handler in the registry — attaching one to a rule
      // would only surface later as a throw in the notification worker.
      if (!isKind(integration.config, 'notification')) {
        throw new TRPCBadRequestError(
          'Integration cannot be used to deliver notifications'
        );
      }
    }
  }

  const data = {
    name: input.name,
    projectId: input.projectId,
    sendToApp: !!input.integrations.find(
      (id) => id === APP_NOTIFICATION_INTEGRATION_ID
    ),
    sendToEmail: !!input.integrations.find(
      (id) => id === EMAIL_NOTIFICATION_INTEGRATION_ID
    ),
    config: input.config,
    template: input.template || null,
  };

  if (input.id) {
    return db.notificationRule.update({
      where: { id: input.id },
      data: {
        ...data,
        integrations: {
          set: input.integrations
            .filter((id) => !isBaseIntegration(id))
            .map((id) => ({ id })),
        },
      },
    });
  }

  return db.notificationRule.create({
    data: {
      ...data,
      integrations: {
        connect: input.integrations
          .filter((id) => !isBaseIntegration(id))
          .map((id) => ({ id })),
      },
    },
  });
}

export async function deleteNotificationRule(deps: ServiceDeps, id: string) {
  return await deps.db.notificationRule.delete({ where: { id } });
}

// -- Services surface --------------------------------------------------

export function createNotificationService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    dispatch: (
      notification: Prisma.NotificationUncheckedCreateInput
    ): Promise<unknown> => deliverNotification(deps, notification),
  };
}
