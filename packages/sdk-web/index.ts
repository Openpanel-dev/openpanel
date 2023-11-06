import type { NewMixanOptions } from '@mixan/sdk';
import { Mixan } from '@mixan/sdk';

import { parseQuery } from './src/parseQuery';
import { getDevice, getOS, getTimezone } from './src/utils';

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export class MixanWeb extends Mixan {
  constructor(
    options: PartialBy<NewMixanOptions, 'setItem' | 'removeItem' | 'getItem'>
  ) {
    super({
      batchInterval: options.batchInterval ?? 1000,
      setItem:
        typeof localStorage === 'undefined'
          ? () => {}
          : localStorage.setItem.bind(localStorage),
      removeItem:
        typeof localStorage === 'undefined'
          ? () => {}
          : localStorage.removeItem.bind(localStorage),
      getItem:
        typeof localStorage === 'undefined'
          ? () => null
          : localStorage.getItem.bind(localStorage),
      ...options,
    });
  }

  isServer() {
    return typeof document === 'undefined';
  }

  async properties() {
    return {
      ip: await super.ip(),
      os: getOS(),
      device: getDevice(),
      ua: navigator.userAgent,
      referrer: document.referrer,
      language: navigator.language,
      timezone: getTimezone(),
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        pixelRatio: window.devicePixelRatio,
      },
    };
  }

  async init(properties?: Record<string, unknown>) {
    if (this.isServer()) {
      return;
    }

    super.init({
      ...(await this.properties()),
      ...(properties ?? {}),
    });
    this.screenView();
  }

  trackOutgoingLinks() {
    if (this.isServer()) {
      return;
    }

    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'A') {
        const href = target.getAttribute('href');
        if (href?.startsWith('http')) {
          super.event('link_out', {
            href,
            text: target.innerText,
          });
          super.flush();
        }
      }
    });
  }

  screenView(properties?: Record<string, unknown>): void {
    if (this.isServer()) {
      return;
    }

    super.event('screen_view', {
      ...properties,
      route: window.location.pathname,
      url: window.location.href,
      query: parseQuery(window.location.search ?? ''),
    });
  }
}
