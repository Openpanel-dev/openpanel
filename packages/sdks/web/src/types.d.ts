import type { OpenPanel, OpenPanelOptions } from './';
import type {
  TrackProperties,
} from '@openpanel/sdk';

type ExposedMethodsNames =
  | 'track'
  | 'identify'
  | 'setGlobalProperties'
  | 'alias'
  | 'increment'
  | 'decrement'
  | 'clear';

export type ExposedMethods = {
  [K in ExposedMethodsNames]: OpenPanel[K] extends (...args: any[]) => any
    ? [K, ...Parameters<OpenPanel[K]>]
    : never;
}[ExposedMethodsNames];

export type OpenPanelMethodNames = ExposedMethodsNames | 'init' | 'screenView';
export type OpenPanelMethods =
  | ExposedMethods
  | ['init', OpenPanelOptions]
  | ['screenView', string | TrackProperties | undefined, TrackProperties | undefined];

declare global {
  interface Window {
    openpanel?: OpenPanel;
    op: {
      q?: OpenPanelMethods[];
      (...args: OpenPanelMethods): void;
    };
  }
}
