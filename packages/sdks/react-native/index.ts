import type {
  OpenPanelOptions,
  TrackHandlerPayload,
  TrackProperties,
} from '@openpanel/sdk';
import { OpenPanel as OpenPanelBase } from '@openpanel/sdk';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

export * from '@openpanel/sdk';

const QUEUE_STORAGE_KEY = '@openpanel/offline_queue';

interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface NetworkStateLike {
  isConnected: boolean | null;
}

interface NetworkInfoLike {
  addEventListener(callback: (state: NetworkStateLike) => void): () => void;
  fetch(): Promise<NetworkStateLike>;
}

export interface ReactNativeOpenPanelOptions extends OpenPanelOptions {
  /**
   * Provide an AsyncStorage-compatible adapter to persist the event queue
   * across app restarts (enables full offline support).
   *
   * @example
   * import AsyncStorage from '@react-native-async-storage/async-storage';
   * new OpenPanel({ clientId: '...', storage: AsyncStorage });
   */
  storage?: StorageLike;
  /**
   * Provide a NetInfo-compatible adapter to detect connectivity changes and
   * automatically flush the queue when the device comes back online.
   *
   * @example
   * import NetInfo from '@react-native-community/netinfo';
   * new OpenPanel({ clientId: '...', networkInfo: NetInfo });
   */
  networkInfo?: NetworkInfoLike;
}

export class OpenPanel extends OpenPanelBase {
  private lastPath = '';
  private readonly storage?: StorageLike;
  private isOnline = true;

  constructor(public options: ReactNativeOpenPanelOptions) {
    super({
      ...options,
      sdk: 'react-native',
      sdkVersion: process.env.REACT_NATIVE_VERSION!,
    });

    this.api.addHeader('User-Agent', Constants.getWebViewUserAgentAsync());
    this.storage = options.storage;

    if (options.networkInfo) {
      options.networkInfo.fetch().then(({ isConnected }) => {
        this.isOnline = isConnected ?? true;
      });
      options.networkInfo.addEventListener(({ isConnected }) => {
        const wasOffline = !this.isOnline;
        this.isOnline = isConnected ?? true;
        if (wasOffline && this.isOnline) {
          this.flush();
        }
      });
    }

    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        this.setDefaultProperties();
        this.flush();
      }
    });

    this.setDefaultProperties();
    this.loadPersistedQueue();
  }

  private async setDefaultProperties() {
    this.setGlobalProperties({
      __version: Application.nativeApplicationVersion,
      __buildNumber: Application.nativeBuildVersion,
      __referrer:
        Platform.OS === 'android'
          ? await Application.getInstallReferrerAsync()
          : undefined,
    });
  }

  private async loadPersistedQueue() {
    if (!this.storage) {
      return;
    }
    try {
      const stored = await this.storage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const items = JSON.parse(stored);
        if (Array.isArray(items) && items.length > 0) {
          this.queue = [...items, ...this.queue];
          this.flush();
        }
      }
    } catch {
      this.log('Failed to load persisted queue');
    }
  }

  private persistQueue() {
    if (!this.storage) {
      return;
    }
    this.storage
      .setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue))
      .catch(() => {
        this.log('Failed to persist queue');
      });
  }

  addQueue(payload: TrackHandlerPayload) {
    super.addQueue(payload);
    this.persistQueue();
  }

  async send(payload: TrackHandlerPayload) {
    if (this.options.filter && !this.options.filter(payload)) {
      return null;
    }
    if (!this.isOnline) {
      this.addQueue(payload);
      return null;
    }
    return await super.send(payload);
  }

  flush() {
    if (!this.isOnline) {
      return;
    }
    super.flush();
    this.persistQueue();
  }

  track(name: string, properties?: TrackProperties) {
    return super.track(name, { ...properties, __path: this.lastPath });
  }

  screenView(route: string, properties?: TrackProperties): void {
    this.lastPath = route;
    super.track('screen_view', {
      ...properties,
      __path: route,
    });
  }
}
