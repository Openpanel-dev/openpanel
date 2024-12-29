import { stripLeadingAndTrailingSlashes } from '@openpanel/common';
import { notificationQueue } from '@openpanel/queue';
import { cacheable } from '@openpanel/redis';
import type { IChartEvent, IChartEventFilter } from '@openpanel/validation';
import { pathOr } from 'ramda';
import {
  type Integration,
  type Notification,
  Prisma,
  db,
} from '../prisma-client';
import type {
  IServiceCreateEventPayload,
  IServiceEvent,
} from './event.service';
import { getProjectByIdCached } from './project.service';

type ICreateNotification = Pick<
  Notification,
  | 'projectId'
  | 'title'
  | 'message'
  | 'integrationId'
  | 'payload'
  | 'notificationRuleId'
>;

export type INotificationPayload =
  | {
      type: 'event';
      event: IServiceCreateEventPayload;
    }
  | {
      type: 'funnel';
      funnel: IServiceEvent[];
    };

export const APP_NOTIFICATION_INTEGRATION_ID = 'app';
export const EMAIL_NOTIFICATION_INTEGRATION_ID = 'email';

export const BASE_INTEGRATIONS: Integration[] = [
  {
    id: APP_NOTIFICATION_INTEGRATION_ID,
    name: 'Website',
    createdAt: new Date(),
    updatedAt: new Date(),
    config: {
      type: APP_NOTIFICATION_INTEGRATION_ID,
    },
    organizationId: '',
  },
  // {
  //   id: EMAIL_NOTIFICATION_INTEGRATION_ID,
  //   name: 'Email',
  //   createdAt: new Date(),
  //   updatedAt: new Date(),
  //   config: {
  //     type: EMAIL_NOTIFICATION_INTEGRATION_ID,
  //   },
  //   organizationId: '',
  // },
];

export const isBaseIntegration = (id: string) =>
  BASE_INTEGRATIONS.find((i) => i.id === id);

export type INotificationRuleCached = Awaited<
  ReturnType<typeof getNotificationRulesByProjectId>
>[number];
export const getNotificationRulesByProjectId = cacheable(
  function getNotificationRulesByProjectId(projectId: string) {
    return db.notificationRule.findMany({
      where: {
        projectId,
      },
      select: {
        id: true,
        name: true,
        sendToApp: true,
        sendToEmail: true,
        config: true,
        template: true,
        integrations: {
          select: {
            id: true,
          },
        },
      },
    });
  },
  60 * 24,
);

function getIntegration(integrationId: string | null) {
  if (integrationId === APP_NOTIFICATION_INTEGRATION_ID) {
    return {
      integrationId: null,
      sendToApp: true,
      sendToEmail: false,
    };
  }

  if (integrationId === EMAIL_NOTIFICATION_INTEGRATION_ID) {
    return {
      integrationId: null,
      sendToApp: false,
      sendToEmail: true,
    };
  }

  return {
    sendToApp: false,
    sendToEmail: false,
    integrationId,
  };
}

export async function createNotification(notification: ICreateNotification) {
  const res = await db.notification.create({
    data: {
      title: notification.title,
      message: notification.message,
      projectId: notification.projectId,
      payload: notification.payload || Prisma.DbNull,
      ...getIntegration(notification.integrationId),
      notificationRuleId: notification.notificationRuleId,
    },
  });

  return triggerNotification(res);
}

export function triggerNotification(notification: Notification) {
  return notificationQueue.add('sendNotification', {
    type: 'sendNotification',
    payload: {
      notification,
    },
  });
}

function matchEventFilters(
  payload: IServiceCreateEventPayload,
  filters: IChartEventFilter[],
) {
  return filters.every((filter) => {
    const { name, value, operator } = filter;

    if (value.length === 0) return true;

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
          .some((val) => new RegExp(val).test(propertyValue));
      }
      default:
        return false;
    }
  });
}

export function matchEvent(
  payload: IServiceCreateEventPayload,
  chartEvent: IChartEvent,
) {
  if (payload.name !== chartEvent.name && chartEvent.name !== '*') {
    return false;
  }

  if (chartEvent.filters.length > 0) {
    return matchEventFilters(payload, chartEvent.filters);
  }

  return true;
}

function notificationTemplateEvent({
  payload,
  rule,
}: {
  payload: IServiceCreateEventPayload;
  rule: INotificationRuleCached;
}) {
  if (!rule.template) return `You received a new "${payload.name}" event`;
  let template = rule.template
    .replaceAll('$EVENT_NAME', payload.name)
    .replaceAll('$RULE_NAME', rule.name)
    .replaceAll('{{rule_name}}', rule.name);

  // Replace all {{xxx}} placeholders with their values
  const placeholderMatches = template.match(/{{[^}]+}}/g) || [];
  for (const match of placeholderMatches) {
    const path = match.slice(2, -2); // Remove {{ and }}
    const value = pathOr('', path.split('.'), payload);

    if (value) {
      template = template.replaceAll(match, JSON.stringify(value));
    }
  }

  return template;
}

function notificationTemplateFunnel({
  events,
  rule,
}: {
  events: IServiceEvent[];
  rule: INotificationRuleCached;
}) {
  if (!rule.template) return `Funnel "${rule.name}" completed`;
  return rule.template
    .replaceAll('$EVENT_NAME', events.map((e) => e.name).join(' -> '))
    .replaceAll('$RULE_NAME', rule.name);
}

export async function checkNotificationRulesForEvent(
  payload: IServiceCreateEventPayload,
) {
  const project = await getProjectByIdCached(payload.projectId);
  const rules = await getNotificationRulesByProjectId(payload.projectId);
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
          title: notificationTemplateEvent({
            payload,
            rule,
          }),
          message: project?.name ? `Project: ${project?.name}` : '',
          projectId: payload.projectId,
          payload: {
            type: 'event',
            event: payload,
          },
        } as const;

        const promises = rule.integrations.map((integration) =>
          createNotification({
            ...notification,
            integrationId: integration.id,
            notificationRuleId: rule.id,
          }),
        );

        if (rule.sendToApp) {
          promises.push(
            createNotification({
              ...notification,
              integrationId: APP_NOTIFICATION_INTEGRATION_ID,
              notificationRuleId: rule.id,
            }),
          );
        }

        if (rule.sendToEmail) {
          promises.push(
            createNotification({
              ...notification,
              integrationId: EMAIL_NOTIFICATION_INTEGRATION_ID,
              notificationRuleId: rule.id,
            }),
          );
        }

        return promises;
      }
    }),
  );
}

export async function checkNotificationRulesForSessionEnd(
  events: IServiceEvent[],
) {
  const sortedEvents = events.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const projectId = sortedEvents[0]?.projectId;
  if (!projectId) return null;

  const [project, rules] = await Promise.all([
    getProjectByIdCached(projectId),
    getNotificationRulesByProjectId(projectId),
  ]);

  const funnelRules = rules.filter((rule) => rule.config.type === 'funnel');

  const notificationPromises = funnelRules.flatMap((rule) => {
    // Match funnel events
    let funnelIndex = 0;
    const matchedEvents: IServiceEvent[] = [];
    for (const event of sortedEvents) {
      if (matchEvent(event, rule.config.events[funnelIndex]!)) {
        matchedEvents.push(event);
        funnelIndex++;
        if (funnelIndex === rule.config.events.length) break;
      }
    }

    // If funnel not completed, skip this rule
    if (funnelIndex < rule.config.events.length) return [];

    // Create notification object
    const notification = {
      title: notificationTemplateFunnel({
        rule,
        events: matchedEvents,
      }),
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
        }),
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
