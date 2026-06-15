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

      this.setGlobalProperties({
        __referrer: document.referrer,
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
   * Storage keys for client-generated replay IDs.
   *
   * The server's default behavior derives session_id from
   * `hash(salt + projectId + ip + ua)`. That collides for every user
   * behind the same NAT (corporate office, shared WiFi, mobile carrier
   * NAT) — their replay timelines get merged into one.
   *
   * We avoid this by generating IDs in the browser:
   *  - device_id   localStorage   persists forever; identifies the browser
   *  - session_id  sessionStorage tab-scoped; rotates on 30-min idle
   *  - last_activity is the wallclock of the last `track`/`replay` event
   *    we've sent on this tab; used to decide if the session is still
   *    fresh enough to reuse, or if we need to mint a new one.
   *
   * On the wire, only `session_id` matters today (it's carried with each
   * replay chunk and the server trusts it). device_id is stored for
   * future use (cross-tab user-journey stitching) but not currently
   * sent — that's a follow-up once the server-side accepts it.
   */
  private static readonly DEVICE_ID_KEY = '_op_device_id';
  private static readonly SESSION_ID_KEY = '_op_session_id';
  private static readonly LAST_ACTIVITY_KEY = '_op_last_activity';
  private static readonly SESSION_IDLE_MS = 30 * 60 * 1000;

  /**
   * Generate a v4 UUID. Uses `crypto.randomUUID()` where available
   * (modern browsers + HTTPS); falls back to a `Math.random`-based
   * generator for older browsers and `http://` contexts where the
   * Web Crypto API is unavailable. The fallback is fine for an
   * analytics session identifier — we don't need cryptographic
   * unpredictability, just collision-resistance.
   */
  private newUuid(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
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
   * Returns a sessionId for this tab, generating + persisting one if
   * needed. Also lazily persists a deviceId in localStorage (not
   * currently sent on the wire — reserved for future cross-tab work).
   *
   * Returns null if browser storage is unavailable (server-side render,
   * sandboxed iframe with `storage-access` blocked, quota exhausted).
   * Caller should fall back to the server-derived sessionId in that
   * case so we don't lose replays.
   */
  private initReplayIdsFromStorage(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      // Persistent device_id — kept across tabs and visits.
      let deviceId = localStorage.getItem(OpenPanel.DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = this.newUuid();
        localStorage.setItem(OpenPanel.DEVICE_ID_KEY, deviceId);
      }
      this.deviceId = deviceId;

      // Per-tab session_id with 30-min idle rotation. Matches the
      // existing server behavior so analytics session counts don't
      // drift after this change.
      const now = Date.now();
      const lastActivity = Number.parseInt(
        sessionStorage.getItem(OpenPanel.LAST_ACTIVITY_KEY) ?? '0',
        10,
      );
      const idleTooLong =
        Number.isFinite(lastActivity) &&
        lastActivity > 0 &&
        now - lastActivity > OpenPanel.SESSION_IDLE_MS;

      let sessionId = sessionStorage.getItem(OpenPanel.SESSION_ID_KEY);
      if (!sessionId || idleTooLong) {
        sessionId = this.newUuid();
        sessionStorage.setItem(OpenPanel.SESSION_ID_KEY, sessionId);
      }
      sessionStorage.setItem(OpenPanel.LAST_ACTIVITY_KEY, String(now));
      this.sessionId = sessionId;

      return sessionId;
    } catch {
      // Storage unavailable (private mode quirks, sandboxed iframe,
      // quota exhausted). Caller falls back to server-derived.
      return null;
    }
  }

  /**
   * Refresh the last-activity wallclock. Called from the recorder
   * callback so an actively-used tab keeps the same sessionId
   * indefinitely; only goes idle when the user actually stops
   * interacting for 30 minutes.
   */
  private bumpReplayActivity() {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(OpenPanel.LAST_ACTIVITY_KEY, String(Date.now()));
    } catch {}
  }

  private async maybeStartReplay() {
    const opts = this.options.sessionReplay;
    if (!opts?.enabled) return;

    const sampleRate = opts.sampleRate ?? 1;
    if (Math.random() >= sampleRate) {
      this.log('replay sample miss, not recording');
      return;
    }

    // Prefer a client-generated sessionId. Fixes the NAT-collision
    // case where multiple users on the same office/home IP collapse
    // into one shared session_id. Falls back to the legacy
    // server-derived id if browser storage is unavailable.
    const localSessionId = this.initReplayIdsFromStorage();
    if (localSessionId) {
      this.log('replay: using client-generated session_id', localSessionId);
    } else {
      const startTimeoutMs = opts.startTimeoutMs ?? 10_000;
      const pollIntervalMs = 500;
      const start = Date.now();

      // Storage unavailable — fall back to server-derived id from /track/device-id.
      while (!this.sessionId && Date.now() - start < startTimeoutMs) {
        await this.fetchDeviceId().catch(() => undefined);
        if (this.sessionId) break;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }

    if (!this.sessionId) {
      this.log('replay: no sessionId after timeout, not starting recorder');
      return;
    }

    const sessionId = this.sessionId;
    startReplayRecorder(opts, (chunk) => {
      this.bumpReplayActivity();
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
