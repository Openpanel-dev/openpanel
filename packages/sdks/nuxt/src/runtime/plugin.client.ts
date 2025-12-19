import { OpenPanel } from '@openpanel/web';
import { defineNuxtPlugin, useRuntimeConfig } from '#app';
import type { ModuleOptions } from '../types';

declare module '#app' {
  interface NuxtApp {
    $openpanel: OpenPanel;
  }
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $openpanel: OpenPanel;
  }
}

export default defineNuxtPlugin({
  name: 'openpanel',
  parallel: true,
  setup() {
    const config = useRuntimeConfig().public.openpanel as ModuleOptions;
    const op = new OpenPanel(config);

    return {
      provide: {
        openpanel: op,
      },
    };
  },
});
