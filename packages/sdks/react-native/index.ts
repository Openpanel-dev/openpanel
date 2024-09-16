import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import type { OpenPanelOptions, TrackProperties } from '@openpanel/sdk';
import { OpenPanel as OpenPanelBase } from '@openpanel/sdk';

export * from '@openpanel/sdk';

export class OpenPanel extends OpenPanelBase {
  constructor(public options: OpenPanelOptions) {
    super({
      ...options,
      sdk: 'react-native',
      sdkVersion: process.env.REACT_NATIVE_VERSION!,
    });

    this.api.addHeader('User-Agent', Constants.getWebViewUserAgentAsync());

    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        this.setDefaultProperties();
      }
    });

    this.setDefaultProperties();
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

  public screenView(route: string, properties?: TrackProperties): void {
    super.track('screen_view', {
      ...properties,
      __path: route,
    });
  }
}
