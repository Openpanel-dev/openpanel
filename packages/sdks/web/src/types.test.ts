// Test callable function API
function testCallableAPI() {
  // ✅ Should work - correct callable syntax
  window.op('track', 'button_clicked', { location: 'header' });
  window.op('identify', { profileId: 'user123', email: 'test@example.com' });
  window.op('init', { clientId: 'test-client-id' });
  window.op('screenView', '/page', { title: 'Test Page' });
  window.op('setGlobalProperties', { version: '1.0.0' });

  // ❌ Should error - wrong method name
  // @ts-expect-error - 'invalidMethod' is not a valid method
  window.op('invalidMethod', 'test');

  // ❌ Should error - wrong arguments for track
  // @ts-expect-error - track expects (name: string, properties?: TrackProperties)
  window.op('track', 123);
}

// Test direct method API
function testDirectMethodAPI() {
  // ✅ Should work - correct direct method syntax
  window.op.track('button_clicked', { location: 'header' });
  window.op.identify({ profileId: 'user123', email: 'test@example.com' });
  window.op.screenView('/page', { title: 'Test Page' });
  window.op.screenView({ title: 'Test Page' }); // Overload with just properties
  window.op.setGlobalProperties({ version: '1.0.0' });
  window.op.revenue(1000, { currency: 'USD' });
  window.op.pendingRevenue(500, { productId: '123' });
  window.op.flushRevenue();
  window.op.clearRevenue();
  window.op.fetchDeviceId();

  // ❌ Should error - wrong arguments for track
  // @ts-expect-error - track expects (name: string, properties?: TrackProperties)
  window.op.track(123);

  // ❌ Should error - wrong arguments for identify
  // @ts-expect-error - identify expects IdentifyPayload
  window.op.identify('user123');
}

// Test queue property
function testQueueProperty() {
  // ✅ Should work - q is optional and can be accessed
  const queue = window.op.q;
  if (queue) {
    queue.forEach((item) => {
      // Queue items should be properly typed
      if (item[0] === 'track') {
        const eventName = item[1]; // Should be string
        const properties = item[2]; // Should be TrackProperties | undefined
      }
    });
  }
}

// Test that both APIs work together
function testBothAPIs() {
  // Mix and match - both should work
  window.op('track', 'event1', { prop: 'value' });
  window.op.track('event2', { prop: 'value' });
  window.op('identify', { profileId: '123' });
  window.op.identify({ profileId: '456' });
}

// Test autocomplete and type inference
function testTypeInference() {
  // TypeScript should infer the correct types
  const trackCall = window.op.track;
  // trackCall should be: (name: string, properties?: TrackProperties) => Promise<void>

  const identifyCall = window.op.identify;
  // identifyCall should be: (payload: IdentifyPayload) => Promise<void>

  // Callable function should accept OpenPanelMethods
  const callable = window.op;
  // callable should be callable with OpenPanelMethods
}

function testExpectedErrors() {
  // @ts-expect-error - 'invalidMethod' is not a valid method
  window.op('invalidMethod', 'test');
  // @ts-expect-error - track expects (name: string, properties?: TrackProperties)
  window.op.track(123);
  // @ts-expect-error - identify expects IdentifyPayload
  window.op.identify('user123');
}

export {};
