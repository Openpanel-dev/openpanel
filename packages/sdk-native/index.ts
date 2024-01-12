import type { NewMixanOptions } from '@mixan/sdk';
import { Mixan } from '@mixan/sdk';

export class MixanNative extends Mixan {
  constructor(options: NewMixanOptions) {
    super(options);
  }

  init(properties?: Record<string, unknown>) {
    super.init({
      ...(properties ?? {}),
    });
  }

  screenView(route: string, properties?: Record<string, unknown>): void {
    super.event('screen_view', {
      ...properties,
      route: route,
    });
  }
}
