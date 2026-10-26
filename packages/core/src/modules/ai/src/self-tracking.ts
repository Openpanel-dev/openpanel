// OpenPanel observing its own model calls: every language model the backend
// builds goes through the same middleware a customer would install, and the
// events land in whichever project OP_CLIENT_ID names. Without that config
// the model is returned untouched.

import { openpanelAiMiddleware } from '@openpanel/ai';
import { OpenPanel } from '@openpanel/sdk';
import { type LanguageModel, wrapLanguageModel } from 'ai';
import type { CoreConfig } from '../../../config';

const SDK_NAME = 'openpanel-api';
const SDK_VERSION = '1.0.0';

// Memoized per `CoreConfig`, like the provider clients: a second config in one
// process (a test, a reboot) gets its own client.
const clients = new WeakMap<CoreConfig, OpenPanel | null>();

export function selfTrackingClient(config: CoreConfig): OpenPanel | null {
  const memoized = clients.get(config);
  if (memoized !== undefined) {
    return memoized;
  }
  const { clientId, clientSecret, apiUrl } = config.selfTracking;
  const client = clientId
    ? new OpenPanel({
        clientId,
        clientSecret,
        apiUrl,
        sdk: SDK_NAME,
        sdkVersion: SDK_VERSION,
      })
    : null;
  clients.set(config, client);
  return client;
}

export function instrumentLanguageModel(
  config: CoreConfig,
  model: LanguageModel
): LanguageModel {
  const op = selfTrackingClient(config);
  if (!op || typeof model === 'string') {
    return model;
  }
  return wrapLanguageModel({
    model,
    middleware: openpanelAiMiddleware({ op }),
  });
}
