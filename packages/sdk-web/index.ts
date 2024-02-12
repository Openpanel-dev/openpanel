import type { MixanOptions } from '@mixan/sdk';
import { Mixan } from '@mixan/sdk';

type MixanWebOptions = MixanOptions & {
  trackOutgoingLinks?: boolean;
  trackScreenViews?: boolean;
  hash?: boolean;
};

export class MixanWeb extends Mixan<MixanWebOptions> {
  private lastPath = '';

  constructor(options: MixanWebOptions) {
    super(options);

    if (!this.isServer()) {
      this.setGlobalProperties({
        referrer: document.referrer,
      });

      if (this.options.trackOutgoingLinks) {
        this.trackOutgoingLinks();
      }

      if (this.options.trackScreenViews) {
        this.trackScreenViews();
      }
    }
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
          super.event('link_out', {
            href,
            text:
              link.innerText ||
              link.getAttribute('title') ||
              target.getAttribute('alt') ||
              target.getAttribute('title'),
          });
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

    window.addEventListener('popstate', () =>
      window.dispatchEvent(new Event('locationchange'))
    );

    if (this.options.hash) {
      window.addEventListener('hashchange', () => this.screenView());
    } else {
      window.addEventListener('locationchange', () => this.screenView());
    }

    this.screenView();
  }

  public screenView(properties?: Record<string, unknown>): void {
    if (this.isServer()) {
      return;
    }

    const path = window.location.href;

    if (this.lastPath === path) {
      return;
    }

    this.lastPath = path;
    super.event('screen_view', {
      ...(properties ?? {}),
      path,
      title: document.title,
    });
  }
}
