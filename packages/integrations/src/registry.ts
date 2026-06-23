import { encryptCredential } from '@openpanel/common/server';
import {
  execute as executeJavaScriptTemplate,
  validate as validateJavaScriptTemplate,
} from '@openpanel/js-runtime';
import type { IIntegrationConfig } from '@openpanel/validation';
import {
  sendDiscordNotification,
  sendTestDiscordNotification,
} from './discord';
import {
  createGCSAdapter,
  createS3Adapter,
  type IObjectStoreAdapter,
} from './object-store';
import { sendSlackNotification } from './slack';

/** Narrow the integration config union to one `type`. */
export type ConfigOf<T extends IIntegrationConfig['type']> = Extract<
  IIntegrationConfig,
  { type: T }
>;

/**
 * Structural mirror of @openpanel/db `INotificationPayload`, kept local so the
 * integrations package needn't depend on db. The worker passes the real,
 * fully-typed payload — it's assignable to this looser shape.
 */
export type INotificationDeliverPayload =
  | { type: 'event'; event: unknown }
  | { type: 'funnel'; funnel: unknown };

export interface INotificationDeliverArgs<
  T extends IIntegrationConfig['type'],
> {
  config: ConfigOf<T>;
  notification: { title: string; message: string };
  payload: INotificationDeliverPayload;
}

/**
 * Server-side behavior for one integration type. Capability slots are optional;
 * which ones are present is declared by the core descriptor's `kinds`. A new
 * integration adds one entry to SERVER_INTEGRATIONS — the `satisfies Record`
 * below forces an entry for every union member (a missing one is a compile
 * error, not a silent runtime gap).
 *
 * The notification capability is added in a later step (it needs the db payload
 * type + js-runtime); export-only for now.
 */
export interface IServerIntegration<T extends IIntegrationConfig['type']> {
  type: T;
  // Notification sink (delivered when a notification rule matches).
  notification?: {
    deliver(args: INotificationDeliverArgs<T>): Promise<unknown> | unknown;
  };
  // Object-store export sink.
  export?: {
    createAdapter(config: ConfigOf<T>): IObjectStoreAdapter;
  };
  // Optional synchronous config validation run before persisting (e.g. webhook
  // JS template). Returning invalid rejects the create/update.
  validateConfig?(config: ConfigOf<T>): { valid: boolean; error?: string };
  // Optional pre-save connection test (used by the generic tRPC procedure).
  testConnection?(
    config: ConfigOf<T>,
  ): Promise<{ success: boolean; error?: string }>;
  // Optional at-rest credential encryption applied before persisting config.
  encryptCredentials?(config: ConfigOf<T>): ConfigOf<T>;
}

const slackServer: IServerIntegration<'slack'> = {
  type: 'slack',
  notification: {
    deliver: ({ config, notification }) =>
      sendSlackNotification({
        webhookUrl: config.incoming_webhook.url,
        message: [`🔔 *${notification.title}*`, notification.message].join('\n'),
      }),
  },
};

const discordServer: IServerIntegration<'discord'> = {
  type: 'discord',
  testConnection: async (config) => {
    const res = await sendTestDiscordNotification(config.url);
    return res.ok
      ? { success: true }
      : { success: false, error: 'Failed to send test notification' };
  },
  notification: {
    deliver: ({ config, notification }) =>
      sendDiscordNotification({
        webhookUrl: config.url,
        message: [`🔔 **${notification.title}**`, notification.message].join(
          '\n'
        ),
      }),
  },
};

const webhookServer: IServerIntegration<'webhook'> = {
  type: 'webhook',
  validateConfig: (config) => {
    if (config.mode === 'javascript' && config.javascriptTemplate) {
      const result = validateJavaScriptTemplate(config.javascriptTemplate);
      if (!result.valid) {
        return { valid: false, error: result.error };
      }
    }
    return { valid: true };
  },
  notification: {
    deliver: ({ config, notification, payload }) => {
      let body: unknown;
      if (config.mode === 'javascript') {
        // We only transform event payloads for now (not funnel)
        if (config.javascriptTemplate && payload.type === 'event') {
          body = executeJavaScriptTemplate(
            config.javascriptTemplate,
            payload.event as Record<string, unknown>
          );
        } else {
          body = payload;
        }
      } else {
        body = {
          title: notification.title,
          message: notification.message,
        };
      }

      return fetch(config.url, {
        method: 'POST',
        headers: {
          ...(config.headers ?? {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    },
  },
};

const s3Server: IServerIntegration<'s3_export'> = {
  type: 's3_export',
  export: {
    createAdapter: (config) => createS3Adapter(config),
  },
  testConnection: (config) => createS3Adapter(config).testConnection(),
  encryptCredentials: (config) =>
    config.authMode === 'access_key'
      ? {
          ...config,
          secretAccessKey: encryptCredential(config.secretAccessKey),
        }
      : config,
};

const gcsServer: IServerIntegration<'gcs_export'> = {
  type: 'gcs_export',
  export: {
    createAdapter: (config) => createGCSAdapter(config),
  },
  testConnection: (config) => createGCSAdapter(config).testConnection(),
  encryptCredentials: (config) => ({
    ...config,
    serviceAccountKey: encryptCredential(config.serviceAccountKey),
  }),
};

export const SERVER_INTEGRATIONS = {
  slack: slackServer,
  discord: discordServer,
  webhook: webhookServer,
  // Pseudo-integrations dispatched by sendToApp/sendToEmail flags before the
  // registry lookup; no server delivery handler of their own.
  app: { type: 'app' },
  email: { type: 'email' },
  s3_export: s3Server,
  gcs_export: gcsServer,
} satisfies {
  [T in IIntegrationConfig['type']]: IServerIntegration<T>;
};

/**
 * Look up a server integration by type. Indexing the record by a union-typed
 * key widens the handler params, so the one unavoidable cast in the whole
 * dispatch path lives here; call sites get a correctly-typed IServerIntegration<T>.
 */
export function getServerIntegration<T extends IIntegrationConfig['type']>(
  type: T,
): IServerIntegration<T> {
  return SERVER_INTEGRATIONS[type] as unknown as IServerIntegration<T>;
}
