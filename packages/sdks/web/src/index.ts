import type {
  OpenPanelOptions as OpenPanelBaseOptions,
  TrackProperties,
} from '@openpanel/sdk';
import { OpenPanel as OpenPanelBase } from '@openpanel/sdk';
import {
  type ReplayRecorderConfig,
  startReplayRecorder,
  stopReplayRecorder,
} from './replay';

export type * from '@openpanel/sdk';
export { OpenPanel as OpenPanelBase } from '@openpanel/sdk';

export type SessionReplayOptions = ReplayRecorderConfig & {
  enabled: boolean;
  /**
   * Fraction of sessions to record. 0..1 (default 1 = record all).
   */
  sampleRate?: number;
  /**
   * Max milliseconds to wait for a session_id (established by a track call)
   * before giving up on starting the recorder. Default 10000.
   */
  startTimeoutMs?: number;
};

export type OpenPanelOptions = OpenPanelBaseOptions & {
  trackOutgoingLinks?: boolean;
  trackScreenViews?: boolean;
  trackAttributes?: boolean;
  trackHashChanges?: boolean;
  sessionReplay?: SessionReplayOptions;
};

function toCamelCase(str: string) {
  return str.replace(/([-_][a-z])/gi, ($1) =>
    $1.toUpperCase().replace('-', '').replace('_', ''),
  );
}

type PendingRevenue = {
  amount: number;
  properties?: Record<string, unknown>;
};

export class OpenPanel extends OpenPanelBase {
  private lastPath = '';
  private debounceTimer: any;
  private pendingRevenues: PendingRevenue[] = [];

  constructor(public options: OpenPanelOptions) {
    super({
      sdk: 'web',
      sdkVersion: process.env.WEB_VERSION!,
      ...options,
    });

    if (!this.isServer()) {
      try {
        const pending = sessionStorage.getItem('openpanel-pending-revenues');
        if (pending) {
          const parsed = JSON.parse(pending);
          if (Array.isArray(parsed)) {
            this.pendingRevenues = parsed;
          }
        }
      } catch {
        this.pendingRevenues = [];
      }

      // Auto-generate a persistent deviceId in localStorage and send it
      // as `__deviceId` on every event. Without this, the server falls
      // back to `hash(salt + projectId + ip + user-agent)`, which collides
      // for every user behind the same NAT (office, home WiFi, mobile
      // carrier) — their sessions and replays get merged together.
      //
      // Consumers can override by calling
      //   op.setGlobalProperties({ __deviceId: someStableUserId })
      // after auth resolves (e.g. with a Firebase UID), which is strictly
      // better than the auto-generated UUID because it stitches the same
      // human across browsers / devices.
      const initialDeviceId = this.initLocalDeviceId();
      this.setGlobalProperties({
        __referrer: document.referrer,
        ...(initialDeviceId ? { __deviceId: initialDeviceId } : {}),
      });

      if (this.options.trackScreenViews) {
        this.trackScreenViews();
        setTimeout(() => this.screenView(), 0);
      }

      if (this.options.trackOutgoingLinks) {
        this.trackOutgoingLinks();
      }

      if (this.options.trackAttributes) {
        this.trackAttributes();
      }

      if (this.options.sessionReplay?.enabled) {
        this.maybeStartReplay();
      }
    }
  }

  /**
   * Storage key for the persistent client-side deviceId.
   *
   * Consumers can override by calling
   *   op.setGlobalProperties({ __deviceId: stableUserId })
   * after auth resolves. The override only affects new events emitted
   * after the call — events already in flight keep the localStorage id.
   */
  private static readonly LOCAL_DEVICE_ID_KEY = '_op_device_id';

  /**
   * Generate a v4 UUID. Uses `crypto.randomUUID()` where available
   * (modern browsers + secure contexts including http://localhost);
   * falls back to `Math.random` for older browsers and sandboxed
   * contexts where the Web Crypto API is unavailable. The fallback is
   * fine for an analytics identifier — we need collision-resistance, not
   * cryptographic unpredictability.
   */
  private newUuid(): string {
    try {
      if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
      ) {
        return crypto.randomUUID();
      }
    } catch {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Read or create the persistent deviceId in localStorage, and stash it
   * on the base SDK so `fetchDeviceId` can pass it back to the server.
   *
   * Returns the deviceId, or null if browser storage is unavailable
   * (private mode quirks, sandboxed iframe, quota exhausted). In the
   * null case, the caller should NOT call `setGlobalProperties({ __deviceId })`
   * and the server falls back to its existing IP+UA derivation. This
   * gives us a clean backward-compat path with zero regression.
   */
  private initLocalDeviceId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      let deviceId = localStorage.getItem(OpenPanel.LOCAL_DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = this.newUuid();
        localStorage.setItem(OpenPanel.LOCAL_DEVICE_ID_KEY, deviceId);
      }
      // Stashed on the base SDK so `fetchDeviceId()` can pass it as a
      // query param to /track/device-id, getting back the correct
      // sessionId for this device.
      this.deviceId = deviceId;
      return deviceId;
    } catch {
      return null;
    }
  }

  private async maybeStartReplay() {
    const opts = this.options.sessionReplay;
    if (!opts?.enabled) return;

    const sampleRate = opts.sampleRate ?? 1;
    if (Math.random() >= sampleRate) {
      this.log('replay sample miss, not recording');
      return;
    }

    const startTimeoutMs = opts.startTimeoutMs ?? 10_000;
    const pollIntervalMs = 500;
    const start = Date.now();

    // Poll until we have a sessionId (established by track calls) or timeout.
    while (!this.sessionId && Date.now() - start < startTimeoutMs) {
      await this.fetchDeviceId().catch(() => undefined);
      if (this.sessionId) break;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (!this.sessionId) {
      this.log('replay: no sessionId after timeout, not starting recorder');
      return;
    }

    const sessionId = this.sessionId;
    startReplayRecorder(opts, (chunk) => {
      this.send({
        type: 'replay',
        payload: {
          ...chunk,
          session_id: sessionId,
        },
      });
    });
  }

  public stopReplay() {
    stopReplayRecorder();
  }

  private debounce(func: () => void, delay: number) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(func, delay);
  }

  private isServer() {
    return typeof document === 'undefined';
  }

  public trackOutgoingLinks() {
    if (this.isServer()) {
      return;
    }

    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a');
      if (link && target) {
        const href = link.getAttribute('href');
        if (href?.startsWith('http')) {
          try {
            const linkUrl = new URL(href);
            const currentHostname = window.location.hostname;
            if (linkUrl.hostname !== currentHostname) {
              super.track('link_out', {
                href,
                text:
                  link.innerText ||
                  link.getAttribute('title') ||
                  target.getAttribute('alt') ||
                  target.getAttribute('title'),
              });
            }
          } catch {
            // Invalid URL, skip tracking
          }
        }
      }
    });
  }

  public trackScreenViews() {
    if (this.isServer()) {
      return;
    }

    const oldPushState = history.pushState;
    history.pushState = function pushState(...args) {
      const ret = oldPushState.apply(this, args);
      window.dispatchEvent(new Event('pushstate'));
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    };

    const oldReplaceState = history.replaceState;
    history.replaceState = function replaceState(...args) {
      const ret = oldReplaceState.apply(this, args);
      window.dispatchEvent(new Event('replacestate'));
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    };

    window.addEventListener('popstate', () => {
      window.dispatchEvent(new Event('locationchange'));
    });

    const eventHandler = () => this.debounce(() => this.screenView(), 50);

    if (this.options.trackHashChanges) {
      window.addEventListener('hashchange', eventHandler);
    } else {
      window.addEventListener('locationchange', eventHandler);
    }
  }

  public trackAttributes() {
    if (this.isServer()) {
      return;
    }

    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const btn = target.closest('button');
      const anchor = target.closest('a');
      const element = btn?.getAttribute('data-track')
        ? btn
        : anchor?.getAttribute('data-track')
          ? anchor
          : null;
      if (element) {
        const properties: Record<string, unknown> = {};
        for (const attr of element.attributes) {
          if (attr.name.startsWith('data-') && attr.name !== 'data-track') {
            properties[toCamelCase(attr.name.replace(/^data-/, ''))] =
              attr.value;
          }
        }
        const name = element.getAttribute('data-track');
        if (name) {
          super.track(name, properties);
        }
      }
    });
  }

  screenView(properties?: TrackProperties): void;
  screenView(path: string, properties?: TrackProperties): void;
  screenView(
    pathOrProperties?: string | TrackProperties,
    propertiesOrUndefined?: TrackProperties,
  ): void {
    if (this.isServer()) {
      return;
    }

    let path: string;
    let properties: TrackProperties | undefined;

    if (typeof pathOrProperties === 'string') {
      path = pathOrProperties;
      properties = propertiesOrUndefined;
    } else {
      path = window.location.href;
      properties = pathOrProperties;
    }

    if (this.lastPath === path) {
      return;
    }

    this.lastPath = path;
    super.track('screen_view', {
      ...(properties ?? {}),
      __path: path,
      __title: document.title,
    });
  }

  async flushRevenue() {
    const promises = this.pendingRevenues.map((pending) =>
      super.revenue(pending.amount, pending.properties),
    );
    await Promise.all(promises);
    this.clearRevenue();
  }

  clearRevenue() {
    this.pendingRevenues = [];
    if (!this.isServer()) {
      try {
        sessionStorage.removeItem('openpanel-pending-revenues');
      } catch {}
    }
  }

  pendingRevenue(amount: number, properties?: Record<string, unknown>) {
    this.pendingRevenues.push({ amount, properties });
    if (!this.isServer()) {
      try {
        sessionStorage.setItem(
          'openpanel-pending-revenues',
          JSON.stringify(this.pendingRevenues),
        );
      } catch {}
    }
  }
}
