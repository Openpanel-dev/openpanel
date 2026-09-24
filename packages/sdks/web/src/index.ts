import type {
  OpenPanelOptions as OpenPanelBaseOptions,
  TrackProperties,
} from '@openpanel/sdk';
import { OpenPanel as OpenPanelBase } from '@openpanel/sdk';
import {
  resolveSessionReplayRecorder,
  type SessionReplayRecorder,
} from './resolve-replay-recorder';

export type * from '@openpanel/sdk';
export { OpenPanel as OpenPanelBase } from '@openpanel/sdk';
export type {
  SessionReplayChunkPayload,
  SessionReplayRecorder,
  SessionReplayRecorderConfig,
} from './resolve-replay-recorder';

export type SessionReplayOptions = {
  enabled: boolean;
  sampleRate?: number;
  maskAllInputs?: boolean;
  /**
   * Mask all text content in the recording. Defaults to true.
   * When true, all text is replaced with asterisks.
   */
  maskAllText?: boolean;
  /**
   * CSS selector for elements whose text should NOT be masked,
   * even when maskAllText is true.
   * Example: '[data-openpanel-unmask]'
   */
  unmaskTextSelector?: string;
  blockSelector?: string;
  blockClass?: string;
  ignoreSelector?: string;
  flushIntervalMs?: number;
  maxEventsPerChunk?: number;
  maxPayloadBytes?: number;
  /**
   * URL to the replay recorder script.
   * Only used when loading the SDK via a script tag (IIFE / op1.js).
   * When using the npm package with a bundler this option is ignored —
   * pass `recorder` from `@openpanel/web/replay` instead.
   */
  scriptUrl?: string;
  /**
   * Recorder implementation. Required for the npm / bundler build when
   * `enabled` is true, so rrweb is only included when you import
   * `@openpanel/web/replay`. The script-tag build loads the CDN
   * recorder automatically when this is omitted.
   *
   * @example
   * import { startReplayRecorder } from '@openpanel/web/replay'
   * new OpenPanel({
   *   sessionReplay: { enabled: true, recorder: startReplayRecorder },
   * })
   */
  recorder?: SessionReplayRecorder;
};

// Injected at build time only in the IIFE (tracker) build.
// In the library build this is `undefined`.
declare const __OPENPANEL_REPLAY_URL__: string | undefined;

// Capture script element synchronously; currentScript is only set during sync execution.
// Used by loadIifeReplayRecorder() to derive the replay script URL in the IIFE build.
const _replayScriptRef: HTMLScriptElement | null =
  typeof document !== 'undefined'
    ? (document.currentScript as HTMLScriptElement | null)
    : null;

export type OpenPanelOptions = OpenPanelBaseOptions & {
  trackOutgoingLinks?: boolean;
  trackScreenViews?: boolean;
  trackAttributes?: boolean;
  trackHashChanges?: boolean;
  sessionReplay?: SessionReplayOptions;
};

function toCamelCase(str: string) {
  return str.replace(/([-_][a-z])/gi, ($1) =>
    $1.toUpperCase().replace('-', '').replace('_', '')
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
        const sampleRate = this.options.sessionReplay.sampleRate ?? 1;
        const sampled = Math.random() < sampleRate;
        if (sampled) {
          void this.startSessionReplay();
        }
      }
    }
  }

  /**
   * Start session replay with either an explicit `recorder` (npm) or the
   * CDN script (IIFE / op1.js). The library build never `import()`s
   * `./replay`, so rrweb stays out of apps that do not opt in.
   */
  private async startSessionReplay(): Promise<void> {
    const options = this.options.sessionReplay;
    if (!options) {
      return;
    }

    const recorder = await resolveSessionReplayRecorder({
      recorder: options.recorder,
      isIifeBuild: typeof __OPENPANEL_REPLAY_URL__ !== 'undefined',
      loadIifeRecorder: () => this.loadIifeReplayRecorder(),
    });

    if (!recorder) {
      console.warn(
        '[OpenPanel] sessionReplay.enabled but no recorder was provided. Import startReplayRecorder from @openpanel/web/replay and pass it as sessionReplay.recorder.',
      );
      return;
    }

    recorder(options, (chunk) => {
      // Replay chunks go through send() and are queued when disabled or waitForProfile
      // until ready() is called (base SDK also queues replay until sessionId is set).
      this.send({
        type: 'replay',
        payload: {
          ...chunk,
          sessionId: this.sessionId,
        },
      });
    });
  }

  /**
   * Load the IIFE replay recorder from the CDN (script-tag builds only).
   *
   * `__OPENPANEL_REPLAY_URL__` is replaced at build time with a CDN URL
   * (e.g. `https://openpanel.dev/op1-replay.js`). The user can also
   * override it via `sessionReplay.scriptUrl`. Classic `<script>` avoids
   * CORS issues that dynamic `import(url)` would hit. Exports land on
   * `window.__openpanel_replay`.
   */
  private async loadIifeReplayRecorder(): Promise<SessionReplayRecorder | null> {
    try {
      const scriptEl = _replayScriptRef;
      const url =
        this.options.sessionReplay?.scriptUrl ||
        scriptEl?.src?.replace('.js', '-replay.js') ||
        'https://openpanel.dev/op1-replay.js';

      if ((window as any).__openpanel_replay?.startReplayRecorder) {
        return (window as any).__openpanel_replay.startReplayRecorder;
      }

      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
          resolve(
            (window as any).__openpanel_replay?.startReplayRecorder ?? null,
          );
        };
        script.onerror = () => {
          console.warn('[OpenPanel] Failed to load replay script from', url);
          resolve(null);
        };
        document.head.appendChild(script);
      });
    } catch (e) {
      console.warn('[OpenPanel] Failed to load replay module', e);
      return null;
    }
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

  track(name: string, properties?: TrackProperties) {
    return super.track(name, { ...properties, __path: this.lastPath });
  }

  screenView(properties?: TrackProperties): void;
  screenView(path: string, properties?: TrackProperties): void;
  screenView(
    pathOrProperties?: string | TrackProperties,
    propertiesOrUndefined?: TrackProperties
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
      super.revenue(pending.amount, pending.properties)
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
          JSON.stringify(this.pendingRevenues)
        );
      } catch {}
    }
  }
}
