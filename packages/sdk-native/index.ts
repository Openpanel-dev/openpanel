import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import type { MixanOptions } from '@mixan/sdk';
import { Mixan } from '@mixan/sdk';

type MixanNativeOptions = MixanOptions & {
  ipUrl?: string;
};

export class MixanNative extends Mixan<MixanNativeOptions> {
  constructor(options: MixanNativeOptions) {
    super(options);

    this.api.headers['User-Agent'] = Constants.getWebViewUserAgentAsync();

    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        this.setProperties();
      }
    });

    this.setProperties();
  }

  private async setProperties() {
    this.setGlobalProperties({
      version: Application.nativeApplicationVersion,
      buildNumber: Application.nativeBuildVersion,
      referrer:
        Platform.OS === 'android'
          ? await Application.getInstallReferrerAsync()
          : undefined,
    });
  }

  public screenView(route: string, properties?: Record<string, unknown>): void {
    super.event('screen_view', {
      ...properties,
      path: route,
    });
  }
}
