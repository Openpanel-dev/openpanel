import type { OpenPanel, OpenPanelOptions } from '@openpanel/web';

export interface ModuleOptions extends OpenPanelOptions {
  proxy?: boolean;
}

declare module '#app' {
  interface NuxtApp {
    $openpanel: OpenPanel;
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $openpanel: OpenPanel;
  }
}

// biome-ignore lint/complexity/noUselessEmptyExport: we need to export an empty object to satisfy the type checker
export {};
