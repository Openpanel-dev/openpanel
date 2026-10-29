import type {
  DecrementPayload,
  IdentifyPayload,
  IncrementPayload,
  OpenPanelMethodNames,
  OpenPanelOptions,
  TrackProperties,
} from '@openpanel/web';
import { getInitSnippet } from '@openpanel/web';
// adding .js next/script import fixes an issues
// with esm and nextjs (when using pages dir)
import Script from 'next/script.js';
// biome-ignore lint/correctness/noUnusedImports: nextjs requires this
import React from 'react';

export * from '@openpanel/web';

const CDN_URL = 'https://openpanel.dev/op1.js';

type OpenPanelComponentProps = Omit<OpenPanelOptions, 'filter'> & {
  profileId?: string;
  /** @deprecated Use `scriptUrl` instead. */
  cdnUrl?: string;
  scriptUrl?: string;
  filter?: string;
  globalProperties?: Record<string, unknown>;
  strategy?: 'beforeInteractive' | 'afterInteractive' | 'lazyOnload' | 'worker';
};

// `<` is escaped so a value containing `</script>` cannot end the inline script.
function toScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// `filter` is the developer's own function source, so it is the one value
// inserted as code; everything else is data.
function initOptionsSource({
  filter,
  ...options
}: Record<string, unknown> & { filter?: string }) {
  const data = toScriptJson(options);
  return filter ? `Object.assign(${data},{filter:${filter}})` : data;
}

export function OpenPanelComponent({
  profileId,
  cdnUrl,
  scriptUrl,
  globalProperties,
  strategy = 'afterInteractive',
  ...options
}: OpenPanelComponentProps) {
  const methods: { name: OpenPanelMethodNames; source: string }[] = [
    {
      name: 'init',
      source: initOptionsSource({
        ...options,
        sdk: 'nextjs',
        sdkVersion: process.env.NEXTJS_VERSION!,
      }),
    },
  ];
  if (profileId) {
    methods.push({
      name: 'identify',
      source: toScriptJson({ profileId }),
    });
  }
  if (globalProperties) {
    methods.push({
      name: 'setGlobalProperties',
      source: toScriptJson(globalProperties),
    });
  }

  const appendVersion = (url: string) => {
    if (url.endsWith('.js')) {
      return `${url}?v=${process.env.NEXTJS_VERSION!}`;
    }
    return url;
  };

  return (
    <>
      <Script async defer src={appendVersion(scriptUrl || cdnUrl || CDN_URL)} />
      <Script
        dangerouslySetInnerHTML={{
          __html: `${getInitSnippet()}
          ${methods
            .map((method) => {
              return `window.op('${method.name}', ${method.source});`;
            })
            .join('\n')}`,
        }}
        id="openpanel-init"
        strategy={strategy}
      />
    </>
  );
}

type IdentifyComponentProps = IdentifyPayload;

export function IdentifyComponent(props: IdentifyComponentProps) {
  return (
    <Script
      dangerouslySetInnerHTML={{
        __html: `window.op('identify', ${toScriptJson(props)});`,
      }}
    />
  );
}

export function SetGlobalPropertiesComponent(props: Record<string, unknown>) {
  return (
    <Script
      dangerouslySetInnerHTML={{
        __html: `window.op('setGlobalProperties', ${toScriptJson(props)});`,
      }}
    />
  );
}

export function useOpenPanel() {
  return {
    track,
    screenView,
    identify,
    increment,
    decrement,
    clear,
    setGlobalProperties,
    revenue,
    flushRevenue,
    clearRevenue,
    pendingRevenue,
    fetchDeviceId,
    getDeviceId,
  };
}

function setGlobalProperties(properties: Record<string, unknown>) {
  window.op?.('setGlobalProperties', properties);
}

function track(name: string, properties?: TrackProperties) {
  window.op?.('track', name, properties);
}

function screenView(properties?: TrackProperties): void;
function screenView(path: string, properties?: TrackProperties): void;
function screenView(
  pathOrProperties?: string | TrackProperties,
  propertiesOrUndefined?: TrackProperties
) {
  window.op?.('screenView', pathOrProperties, propertiesOrUndefined);
}

function identify(payload: IdentifyPayload) {
  window.op?.('identify', payload);
}

function increment(payload: IncrementPayload) {
  window.op?.('increment', payload);
}

function decrement(payload: DecrementPayload) {
  window.op('decrement', payload);
}

function fetchDeviceId() {
  return window.op.fetchDeviceId();
}
function getDeviceId() {
  return window.op.getDeviceId();
}
function clearRevenue() {
  window.op.clearRevenue();
}
function pendingRevenue(amount: number, properties?: Record<string, unknown>) {
  window.op.pendingRevenue(amount, properties);
}
function revenue(amount: number, properties?: Record<string, unknown>) {
  return window.op.revenue(amount, properties);
}
function flushRevenue() {
  return window.op.flushRevenue();
}

function clear() {
  window.op?.('clear');
}
