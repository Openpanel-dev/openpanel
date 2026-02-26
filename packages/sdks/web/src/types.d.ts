import type { TrackProperties } from '@openpanel/sdk';
import type { OpenPanel, OpenPanelOptions } from './';

type ExposedMethodsNames =
  | 'track'
  | 'identify'
  | 'setGlobalProperties'
  | 'alias'
  | 'increment'
  | 'decrement'
  | 'clear'
  | 'revenue'
  | 'flushRevenue'
  | 'clearRevenue'
  | 'pendingRevenue'
  | 'screenView'
  | 'fetchDeviceId'
  | 'getDeviceId'
  | 'getSessionId';

export type ExposedMethods = {
  [K in ExposedMethodsNames]: OpenPanel[K] extends (...args: any[]) => any
    ? [K, ...Parameters<OpenPanel[K]>]
    : never;
}[ExposedMethodsNames];

export type OpenPanelMethodNames = ExposedMethodsNames | 'init';
export type OpenPanelMethods =
  | ExposedMethods
  | ['init', OpenPanelOptions]
  | [
      'screenView',
      string | TrackProperties | undefined,
      TrackProperties | undefined,
    ];

// Extract method signatures from OpenPanel for direct method calls
type OpenPanelMethodSignatures = {
  [K in ExposedMethodsNames]: OpenPanel[K];
} & {
  screenView(
    pathOrProperties?: string | TrackProperties,
    properties?: TrackProperties
  ): void;
};

// Create a type that supports both callable and direct method access
type OpenPanelAPI = OpenPanelMethodSignatures & {
  q?: OpenPanelMethods[];
  // Callable function API: window.op('track', 'event', {...})
  (...args: OpenPanelMethods): void;
};

declare global {
  interface Window {
    openpanel?: OpenPanel;
    op: OpenPanelAPI;
  }
}
