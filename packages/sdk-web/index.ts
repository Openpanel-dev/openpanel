import type { NewMixanOptions } from '@mixan/sdk';
import { Mixan } from '@mixan/sdk';
import type { PartialBy } from '@mixan/types';

import { parseQuery } from './src/parseQuery';
import { getTimezone } from './src/utils';

export class MixanWeb extends Mixan {
  constructor(
    options: PartialBy<NewMixanOptions, 'setItem' | 'removeItem' | 'getItem'>
  ) {
    const hasStorage = typeof localStorage === 'undefined';
    super({
      batchInterval: options.batchInterval ?? 2000,
      setItem: hasStorage ? () => {} : localStorage.setItem.bind(localStorage),
      removeItem: hasStorage
        ? () => {}
        : localStorage.removeItem.bind(localStorage),
      getItem: hasStorage
        ? () => null
        : localStorage.getItem.bind(localStorage),
      ...options,
    });
  }

  private isServer() {
    return typeof document === 'undefined';
  }

  private parseUrl(url?: string) {
    if (!url || url === '') {
      return {};
    }

    const ref = new URL(url);
    return {
      host: ref.host,
      path: ref.pathname,
      query: parseQuery(ref.search),
      hash: ref.hash,
    };
  }

  private properties() {
    return {
      ua: navigator.userAgent,
      referrer: document.referrer || undefined,
      language: navigator.language,
      timezone: getTimezone(),
      screen: {
        width: window.screen.width,
        height: window.screen.height,
      },
      title: document.title,
      ...this.parseUrl(window.location.href),
    };
  }

  public init(properties?: Record<string, unknown>) {
    if (this.isServer()) {
      return;
    }

    super.init({
      ...this.properties(),
      ...(properties ?? {}),
    });

    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }

  public trackOutgoingLinks() {
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

  public screenView(properties?: Record<string, unknown>): void {
    if (this.isServer()) {
      return;
    }

    super.event('screen_view', {
      ...properties,
      ...this.parseUrl(window.location.href),
      title: document.title,
    });
  }
}
