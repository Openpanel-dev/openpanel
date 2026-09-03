// Rule matching, templates, the rule cache, the base-integration constants
// and the delivery (dispatch) body all moved into @openpanel/core's
// notification module (M6-005, ADR-008's module map: "rules + dispatch stay
// together"). Re-exported here for existing @openpanel/db importers
// (packages/trpc's notification/integration routers, this file's own
// enqueue orchestration below, apps/start via @openpanel/db) — same shape as
// ./organization.service.ts's re-export since M6-001.
//
// What stays here: `createNotification` / `triggerNotification` /
// `checkNotificationRulesForEvent` / `checkNotificationRulesForSessionEnd` —
// the BullMQ-producer orchestration around a rule match. `@openpanel/queue`
// imports `@openpanel/core` for its logger (packages/queue/src/queues.ts), so
// core cannot import `@openpanel/queue` back without a real package cycle —
// same constraint packages/trpc/src/routers/cohort.ts documents for its own
// enqueue call (M5-003). These four functions are the one place that cycle is
// unavoidable, so they stay on this side of the boundary, built on core's
// rule matching instead of holding a second copy of it.

import { notificationQueue } from '@openpanel/queue';
import {
  APP_NOTIFICATION_INTEGRATION_ID,
  BASE_INTEGRATIONS,
  EMAIL_NOTIFICATION_INTEGRATION_ID,
  getFunnelRules,
  getHasFunnelRules,
  getNotificationRulesByProjectId,
  isBaseIntegration,
  matchEvent,
  notificationTemplateEvent,
  notificationTemplateFunnel,
} from '@openpanel/core';
import type {
  INotificationPayload,
  INotificationRuleCached,
} from '@openpanel/core';
import { db, type Notification, type Prisma } from '../prisma-client';
import type {
  IServiceCreateEventPayload,
  IServiceEvent,
} from './event.service';
import { getProfileById } from './profile.service';
import { getProjectByIdCached } from './project.service';

export {
  APP_NOTIFICATION_INTEGRATION_ID,
  BASE_INTEGRATIONS,
  EMAIL_NOTIFICATION_INTEGRATION_ID,
  getFunnelRules,
  getHasFunnelRules,
  getNotificationRulesByProjectId,
  isBaseIntegration,
  matchEvent,
} from '@openpanel/core';
export type {
  INotificationPayload,
  INotificationRuleCached,
} from '@openpanel/core';

type ICreateNotification = Pick<
  Notification,
  | 'projectId'
  | 'title'
  | 'message'
  | 'integrationId'
  | 'payload'
  | 'notificationRuleId'
>;

function stripNullChars<T>(value: T): T {
  if (typeof value === 'string') {
    return value.split('\u0000').join('') as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stripNullChars) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, stripNullChars(v)])
    ) as T;
  }
  return value;
}

function getIntegration(integrationId: string | null) {
  if (integrationId === APP_NOTIFICATION_INTEGRATION_ID) {
    return { integrationId: null, sendToApp: true, sendToEmail: false };
  }

  if (integrationId === EMAIL_NOTIFICATION_INTEGRATION_ID) {
    return { integrationId: null, sendToApp: false, sendToEmail: true };
  }

  return { sendToApp: false, sendToEmail: false, integrationId };
}

export async function createNotification(notification: ICreateNotification) {
  const data: Prisma.NotificationUncheckedCreateInput = {
    title: notification.title,
    message: notification.message,
    projectId: notification.projectId,
    payload: stripNullChars(notification.payload) || undefined,
    ...getIntegration(notification.integrationId),
    notificationRuleId: notification.notificationRuleId,
  };

  // Only create notifications for app
  if (data.sendToApp) {
    await db.notification.create({ data });
  }

  return triggerNotification(data);
}

export function triggerNotification(
  notification: Prisma.NotificationUncheckedCreateInput
) {
  return notificationQueue.add('sendNotification', {
    type: 'sendNotification',
    payload: { notification },
  });
}

const PROFILE_TEMPLATE_REGEX = /{{profile\.[^}]*}}/;
export async function checkNotificationRulesForEvent(
  payload: IServiceCreateEventPayload
) {
  const project = await getProjectByIdCached(payload.projectId);
  const rules = await getNotificationRulesByProjectId(payload.projectId);

  // If profile is present in the template, add it to the payload (event)
  // so we can use it in the template
  if (
    payload.profileId &&
    rules.some((rule) => rule.template?.match(PROFILE_TEMPLATE_REGEX))
  ) {
    const profile = await getProfileById(payload.profileId, payload.projectId);
    if (profile) {
      (payload as any).profile = profile;
    }
  }

  await Promise.all(
    rules.flatMap((rule) => {
      if (rule.config.type === 'events') {
        const match = rule.config.events.find((event) => {
          return matchEvent(payload, event);
        });

        if (!match) {
          return [];
        }

        const notification = {
          title: notificationTemplateEvent({ payload, rule }),
          message: project?.name ? `Project: ${project?.name}` : '',
          projectId: payload.projectId,
          payload: { type: 'event', event: payload },
        } as const;

        const promises = rule.integrations.map((integration) =>
          createNotification({
            ...notification,
            integrationId: integration.id,
            notificationRuleId: rule.id,
          })
        );

        if (rule.sendToApp) {
          promises.push(
            createNotification({
              ...notification,
              integrationId: APP_NOTIFICATION_INTEGRATION_ID,
              notificationRuleId: rule.id,
            })
          );
        }

        if (rule.sendToEmail) {
          promises.push(
            createNotification({
              ...notification,
              integrationId: EMAIL_NOTIFICATION_INTEGRATION_ID,
              notificationRuleId: rule.id,
            })
          );
        }

        return promises;
      }

      return [];
    })
  );
}

export async function checkNotificationRulesForSessionEnd(
  events: IServiceEvent[]
) {
  const sortedEvents = events.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const projectId = sortedEvents[0]?.projectId;
  if (!projectId) {
    return null;
  }

  const [project, rules] = await Promise.all([
    getProjectByIdCached(projectId),
    getNotificationRulesByProjectId(projectId),
  ]);

  const funnelRules = getFunnelRules(rules);
  const notificationPromises = funnelRules.flatMap((rule) => {
    // Match funnel events
    let funnelIndex = 0;
    const matchedEvents: IServiceEvent[] = [];
    for (const event of sortedEvents) {
      if (matchEvent(event, rule.config.events[funnelIndex]!)) {
        matchedEvents.push(event);
        funnelIndex++;
        if (funnelIndex === rule.config.events.length) {
          break;
        }
      }
    }

    // If funnel not completed, skip this rule
    if (funnelIndex < rule.config.events.length) {
      return [];
    }

    // Create notification object
    const notification = {
      title: notificationTemplateFunnel({ rule, events: matchedEvents }),
      message: project?.name ? `Project: ${project?.name}` : '',
      projectId,
      payload: { type: 'funnel', funnel: matchedEvents } as const,
    };

    // Generate notification promises
    return [
      ...rule.integrations.map((integration) =>
        createNotification({
          ...notification,
          integrationId: integration.id,
          notificationRuleId: rule.id,
        })
      ),
      ...(rule.sendToApp
        ? [
            createNotification({
              ...notification,
              integrationId: APP_NOTIFICATION_INTEGRATION_ID,
              notificationRuleId: rule.id,
            }),
          ]
        : []),
      ...(rule.sendToEmail
        ? [
            createNotification({
              ...notification,
              integrationId: EMAIL_NOTIFICATION_INTEGRATION_ID,
              notificationRuleId: rule.id,
            }),
          ]
        : []),
    ];
  });

  await Promise.all(notificationPromises);
}
