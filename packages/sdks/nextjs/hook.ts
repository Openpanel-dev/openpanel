import type {
  DecrementPayload,
  IdentifyPayload,
  IncrementPayload,
  TrackProperties,
} from '@openpanel/web';

export function useOpenPanel() {
  return {
    track,
    screenView,
    identify,
    increment,
    decrement,
    clear,
    setGlobalProperties,
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
  propertiesOrUndefined?: TrackProperties,
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

function clear() {
  window.op?.('clear');
}
