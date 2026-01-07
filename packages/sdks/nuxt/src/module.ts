import {
  addImports,
  addPlugin,
  addServerHandler,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit';
import type { ModuleOptions } from './types';

export type { ModuleOptions };

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@openpanel/nuxt',
    configKey: 'openpanel',
  },
  defaults: {
    trackScreenViews: true,
    trackOutgoingLinks: true,
    trackAttributes: true,
    trackHashChanges: false,
    disabled: false,
    proxy: false, // Disabled by default
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    // If proxy is enabled, override apiUrl to use the proxy route
    if (options.proxy) {
      options.apiUrl = '/api/openpanel';
    }

    // Expose options to runtime config
    nuxt.options.runtimeConfig.public.openpanel = options;

    // Add client plugin (creates OpenPanel instance)
    addPlugin({
      src: resolver.resolve('./runtime/plugin.client'),
      mode: 'client',
    });

    // Only register server proxy handler if proxy is enabled
    if (options.proxy) {
      addServerHandler({
        route: '/api/openpanel/**',
        handler: resolver.resolve('./runtime/server/api/[...openpanel]'),
      });
    }

    // Auto-import the useOpenPanel composable
    addImports({
      name: 'useOpenPanel',
      from: resolver.resolve('./runtime/composables/useOpenPanel'),
    });
  },
});
