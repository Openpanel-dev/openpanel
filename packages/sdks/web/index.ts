import type { MixanOptions, PostEventPayload } from '@mixan/sdk';
import { Mixan } from '@mixan/sdk';

export * from '@mixan/sdk';

export type MixanWebOptions = MixanOptions & {
  trackOutgoingLinks?: boolean;
  trackScreenViews?: boolean;
  trackAttributes?: boolean;
  hash?: boolean;
};

function toCamelCase(str: string) {
  return str.replace(/([-_][a-z])/gi, ($1) =>
    $1.toUpperCase().replace('-', '').replace('_', '')
  );
}

export class MixanWeb extends Mixan<MixanWebOptions> {
  private lastPath = '';

  constructor(options: MixanWebOptions) {
    super(options);

    if (!this.isServer()) {
      this.setGlobalProperties({
        __referrer: document.referrer,
      });

      if (this.options.trackOutgoingLinks) {
        this.trackOutgoingLinks();
      }

      if (this.options.trackScreenViews) {
        this.trackScreenViews();
      }

      if (this.options.trackAttributes) {
        this.trackAttributes();
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

    // give time for setProfile to be called
    setTimeout(() => {
      this.screenView();
    }, 50);
  }

  public trackAttributes() {
    if (this.isServer()) {
      return;
    }

    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const btn = target.closest('button');
      const achor = target.closest('button');
      const element = btn?.getAttribute('data-event')
        ? btn
        : achor?.getAttribute('data-event')
          ? achor
          : null;
      if (element) {
        const properties: Record<string, unknown> = {};
        for (const attr of element.attributes) {
          if (attr.name.startsWith('data-') && attr.name !== 'data-event') {
            properties[toCamelCase(attr.name.replace(/^data-/, ''))] =
              attr.value;
          }
        }
        const name = element.getAttribute('data-event');
        if (name) {
          super.event(name, properties);
        }
      }
    });
  }

  public screenView(properties?: PostEventPayload['properties']): void {
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
      __path: path,
      __title: document.title,
    });
  }
}
