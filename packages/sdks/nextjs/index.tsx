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

const stringify = (obj: unknown) => {
  if (typeof obj === 'object' && obj !== null && obj !== undefined) {
    const entries = Object.entries(obj).map(([key, value]) => {
      if (key === 'filter') {
        return `"${key}":${value}`;
      }
      return `"${key}":${JSON.stringify(value)}`;
    });
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(obj);
};

export function OpenPanelComponent({
  profileId,
  cdnUrl,
  scriptUrl,
  globalProperties,
  strategy = 'afterInteractive',
  ...options
}: OpenPanelComponentProps) {
  const methods: { name: OpenPanelMethodNames; value: unknown }[] = [
    {
      name: 'init',
      value: {
        ...options,
        sdk: 'nextjs',
        sdkVersion: process.env.NEXTJS_VERSION!,
      },
    },
  ];
  if (profileId) {
    methods.push({
      name: 'identify',
      value: {
        profileId,
      },
    });
  }
  if (globalProperties) {
    methods.push({
      name: 'setGlobalProperties',
      value: globalProperties,
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
              return `window.op('${method.name}', ${stringify(method.value)});`;
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
        __html: `window.op('identify', ${JSON.stringify(props)});`,
      }}
    />
  );
}

export function SetGlobalPropertiesComponent(props: Record<string, unknown>) {
  return (
    <Script
      dangerouslySetInnerHTML={{
        __html: `window.op('setGlobalProperties', ${JSON.stringify(props)});`,
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
