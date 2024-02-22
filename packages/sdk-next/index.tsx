import Script from 'next/script';

import type { MixanEventOptions } from '@mixan/sdk';
import type { MixanWebOptions } from '@mixan/sdk-web';
import type { UpdateProfilePayload } from '@mixan/types';

const CDN_URL = 'http://localhost:3002/op.js';

type OpenpanelMethods =
  | 'ctor'
  | 'event'
  | 'setProfile'
  | 'setProfileId'
  | 'increment'
  | 'decrement'
  | 'clear';

declare global {
  interface Window {
    op: {
      q?: [string, ...any[]];
      (method: OpenpanelMethods, ...args: any[]): void;
    };
  }
}

type OpenpanelProviderProps = MixanWebOptions & {
  profileId?: string;
  cdnUrl?: string;
};

export function OpenpanelProvider({
  profileId,
  cdnUrl,
  ...options
}: OpenpanelProviderProps) {
  const events: { name: OpenpanelMethods; value: unknown }[] = [
    { name: 'ctor', value: options },
  ];
  if (profileId) {
    events.push({ name: 'setProfileId', value: profileId });
  }
  return (
    <>
      <Script src={cdnUrl ?? CDN_URL} async defer />
      <Script
        dangerouslySetInnerHTML={{
          __html: `window.op = window.op || function(...args) {(window.op.q = window.op.q || []).push(args)};
          ${events
            .map((event) => {
              return `window.op('${event.name}', ${JSON.stringify(event.value)});`;
            })
            .join('\n')}`,
        }}
      />
    </>
  );
}

interface SetProfileIdProps {
  value?: string;
}

export function SetProfileId({ value }: SetProfileIdProps) {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{
          __html: `window.op('setProfileId', '${value}');`,
        }}
      />
    </>
  );
}

export function trackEvent(name: string, data?: Record<string, unknown>) {
  window.op('event', name, data);
}

export function trackScreenView(data?: Record<string, unknown>) {
  trackEvent('screen_view', data);
}

export function setProfile(data?: UpdateProfilePayload) {
  window.op('setProfile', data);
}

export function setProfileId(profileId: string) {
  window.op('setProfileId', profileId);
}

export function increment(
  property: string,
  value: number,
  options?: MixanEventOptions
) {
  window.op('increment', property, value, options);
}

export function decrement(
  property: string,
  value: number,
  options?: MixanEventOptions
) {
  window.op('decrement', property, value, options);
}

export function clear() {
  window.op('clear');
}
