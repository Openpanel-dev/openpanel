import React from 'react';
import Script from 'next/script';

import type {
  DecrementPayload,
  IdentifyPayload,
  IncrementPayload,
  OpenPanelMethodNames,
  OpenPanelOptions,
  TrackProperties,
} from '@openpanel/web';

export * from '@openpanel/web';
export { createNextRouteHandler } from './createNextRouteHandler';

const CDN_URL = 'https://openpanel.dev/op.js';

type OpenPanelComponentProps = OpenPanelOptions & {
  profileId?: string;
  cdnUrl?: string;
};

export function OpenPanelComponent({
  profileId,
  cdnUrl,
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
  return (
    <>
      <Script src={cdnUrl ?? CDN_URL} async defer />
      <Script
        dangerouslySetInnerHTML={{
          __html: `window.op = window.op || function(...args) {(window.op.q = window.op.q || []).push(args)};
          ${methods
            .map((method) => {
              return `window.op('${method.name}', ${JSON.stringify(method.value)});`;
            })
            .join('\n')}`,
        }}
      />
    </>
  );
}

type IdentifyComponentProps = IdentifyPayload;

export function IdentifyComponent(props: IdentifyComponentProps) {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{
          __html: `window.op('setProfile', ${JSON.stringify(props)});`,
        }}
      />
    </>
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
  };
}

function track(name: string, properties?: TrackProperties) {
  window.op('track', name, properties);
}

function screenView(properties: TrackProperties) {
  track('screen_view', properties);
}

function identify(payload: IdentifyPayload) {
  window.op('identify', payload);
}

function increment(payload: IncrementPayload) {
  window.op('increment', payload);
}

function decrement(payload: DecrementPayload) {
  window.op('decrement', payload);
}

function clear() {
  window.op('clear');
}
