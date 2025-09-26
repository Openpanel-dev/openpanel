import type {
  DecrementPayload,
  IdentifyPayload,
  IncrementPayload,
  TrackProperties,
} from '@openpanel/web';
import IdentifyComponent from './src/IdentifyComponent.astro';
import OpenPanelComponent from './src/OpenPanelComponent.astro';
import SetGlobalPropertiesComponent from './src/SetGlobalPropertiesComponent.astro';

export * from '@openpanel/web';

export { OpenPanelComponent, IdentifyComponent, SetGlobalPropertiesComponent };

export function setGlobalProperties(properties: Record<string, unknown>) {
  window.op?.('setGlobalProperties', properties);
}

export function track(name: string, properties?: TrackProperties) {
  window.op?.('track', name, properties);
}

export function screenView(properties?: TrackProperties): void;
export function screenView(path: string, properties?: TrackProperties): void;
export function screenView(
  pathOrProperties?: string | TrackProperties,
  propertiesOrUndefined?: TrackProperties,
) {
  window.op?.('screenView', pathOrProperties, propertiesOrUndefined);
}

export function identify(payload: IdentifyPayload) {
  window.op?.('identify', payload);
}

export function increment(payload: IncrementPayload) {
  window.op?.('increment', payload);
}

export function decrement(payload: DecrementPayload) {
  window.op('decrement', payload);
}

export function clear() {
  window.op?.('clear');
}
