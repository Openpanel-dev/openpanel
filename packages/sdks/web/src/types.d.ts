import type { OpenPanel, OpenPanelOptions } from './';

type ExposedMethodsNames =
  | 'screenView'
  | 'track'
  | 'identify'
  | 'alias'
  | 'increment'
  | 'decrement'
  | 'clear';

export type ExposedMethods = {
  [K in ExposedMethodsNames]: OpenPanel[K] extends (...args: any[]) => any
    ? [K, ...Parameters<OpenPanel[K]>]
    : never;
}[ExposedMethodsNames];

export type OpenPanelMethodNames = ExposedMethodsNames | 'init';
export type OpenPanelMethods = ExposedMethods | ['init', OpenPanelOptions];

declare global {
  interface Window {
    openpanel?: OpenPanel;
    op: {
      q?: OpenPanelMethods[];
      (...args: OpenPanelMethods): void;
    };
  }
}
