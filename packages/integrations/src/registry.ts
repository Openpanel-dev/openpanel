import { encryptCredential } from '@openpanel/common/server';
import {
  execute as executeJavaScriptTemplate,
  validate as validateJavaScriptTemplate,
} from '@openpanel/js-runtime';
import { type IIntegrationConfig, looksEncrypted } from '@openpanel/validation';
import {
  sendDiscordNotification,
  sendTestDiscordNotification,
} from './discord';
import { postWebhook } from './fetcher';
import {
  createGCSAdapter,
  createS3Adapter,
  type IObjectStoreAdapter,
} from './object-store';
import { safeWebhookFetcher } from './safe-fetcher';
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
  /**
   * Config keys holding a credential. ONE declaration drives all three things
   * we must do with a secret — encrypt at rest, redact on read, carry the
   * stored value over when an update submits a blank — so they can never drift
   * apart as integrations are added.
   */
  secretFields?: readonly Extract<AllConfigKeys<ConfigOf<T>>, string>[];
}

/**
 * `keyof` over a union yields only the shared keys, which would drop
 * `secretAccessKey` (it lives on just one arm of the S3 auth-mode union).
 * Distributing keeps every arm's keys while still catching a typo.
 */
type AllConfigKeys<T> = T extends unknown ? keyof T : never;

const slackServer: IServerIntegration<'slack'> = {
  type: 'slack',
  notification: {
    deliver: ({ config, notification }) =>
      sendSlackNotification({
        fetcher: safeWebhookFetcher,
        webhookUrl: config.incoming_webhook.url,
        message: [`🔔 *${notification.title}*`, notification.message].join('\n'),
      }),
  },
};

const discordServer: IServerIntegration<'discord'> = {
  type: 'discord',
  testConnection: async (config) => {
    const res = await sendTestDiscordNotification(
      config.url,
      safeWebhookFetcher,
    );
    return res.ok
      ? { success: true }
      : { success: false, error: 'Failed to send test notification' };
  },
  notification: {
    deliver: ({ config, notification }) =>
      sendDiscordNotification({
        fetcher: safeWebhookFetcher,
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

      // The webhook URL, its headers and (in javascript mode) its body are all
      // user-controlled, and this runs inside our network. Re-validate the
      // destination on every send rather than trusting it from when it was
      // saved.
      return postWebhook(
        safeWebhookFetcher,
        config.url,
        body,
        config.headers ?? {},
      );
    },
  },
};

const s3Server: IServerIntegration<'s3_export'> = {
  type: 's3_export',
  export: {
    createAdapter: (config) => createS3Adapter(config),
  },
  testConnection: (config) => createS3Adapter(config).testConnection(),
  // Absent in iam_role configs; the generic helpers skip keys that aren't there.
  secretFields: ['secretAccessKey'],
};

const gcsServer: IServerIntegration<'gcs_export'> = {
  type: 'gcs_export',
  export: {
    createAdapter: (config) => createGCSAdapter(config),
  },
  testConnection: (config) => createGCSAdapter(config).testConnection(),
  secretFields: ['serviceAccountKey'],
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

// ---------------------------------------------------------------------------
// Generic secret handling, driven by each plugin's `secretFields`.
//
// Credentials are WRITE-ONLY: encrypted before they are persisted, blanked
// before a config is returned to a client, and restored from the stored row
// when an update submits a blank. Returning a stored ciphertext to a client
// would both hand a project *reader* the org's credentials and make the blob
// replayable — decryptCredential accepts any `enc:` value under the single
// global key, so it is a portable bearer token, not an opaque one.
// ---------------------------------------------------------------------------

type LooseConfig = Record<string, unknown> & { type?: string };

/** Lenient like `isKind`: an empty/unknown config simply has no secrets. */
function secretFieldsFor(config: unknown): readonly string[] {
  const type = (config as LooseConfig | null)?.type;
  if (!type || !(type in SERVER_INTEGRATIONS)) {
    return [];
  }
  const plugin = SERVER_INTEGRATIONS[
    type as IIntegrationConfig['type']
  ] as IServerIntegration<IIntegrationConfig['type']>;
  return plugin.secretFields ?? [];
}

function mapSecrets<C>(
  config: C,
  map: (value: string, field: string) => string | undefined,
): C {
  const fields = secretFieldsFor(config);
  if (fields.length === 0) {
    return config;
  }

  let next: Record<string, unknown> | undefined;
  for (const field of fields) {
    const current = (config as LooseConfig)[field];
    if (typeof current !== 'string') {
      continue;
    }
    const replacement = map(current, field);
    if (replacement === undefined || replacement === current) {
      continue;
    }
    next ??= { ...(config as Record<string, unknown>) };
    next[field] = replacement;
  }

  return (next as C) ?? config;
}

/** Encrypt every declared secret before persisting. */
export function encryptConfigSecrets<C>(config: C): C {
  return mapSecrets(config, (value) => encryptCredential(value));
}

/** Blank every declared secret before a config leaves the API. */
export function redactConfigSecrets<C>(config: C): C {
  return mapSecrets(config, (value) => (value === '' ? undefined : ''));
}

/**
 * Restore secrets the client left blank from the stored row, so an edit that
 * doesn't retype the credential keeps working now that reads are redacted.
 */
export function carryOverConfigSecrets<C>(next: C, stored: unknown): C {
  return mapSecrets(next, (value, field) => {
    if (value !== '') {
      return undefined;
    }
    const previous = (stored as LooseConfig | null)?.[field];
    return typeof previous === 'string' ? previous : undefined;
  });
}

/**
 * Name of the first declared secret that arrived already encrypted, if any.
 * Callers reject the request: a client never legitimately holds a ciphertext,
 * so one on the wire is a replay attempt.
 */
export function findEncryptedSecretField(config: unknown): string | undefined {
  for (const field of secretFieldsFor(config)) {
    const value = (config as LooseConfig)[field];
    if (typeof value === 'string' && looksEncrypted(value)) {
      return field;
    }
  }
  return undefined;
}

/**
 * Names of the declared secrets that are present but blank.
 *
 * An ABSENT field is not missing — it is not applicable to this config variant
 * (an `iam_role` S3 config carries no `secretAccessKey` at all), and the zod
 * schema already guarantees the field exists on the variants that need it.
 */
export function findMissingSecretFields(config: unknown): string[] {
  if (typeof config !== 'object' || config === null) {
    return [];
  }
  return secretFieldsFor(config).filter(
    (field) => field in config && (config as LooseConfig)[field] === '',
  );
}
