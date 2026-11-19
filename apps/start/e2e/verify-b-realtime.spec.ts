import { expect, test } from './fixtures';

const MARKER = {
  country: 'SE',
  city: 'Stockholm',
  long: 18.07,
  lat: 59.33,
  count: 3,
};

const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
};

// The seed has no events in the realtime window and local ingest resolves no
// geo, so a visitor with coordinates is supplied at the network boundary.
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`realtime map with a located visitor logs no NaN transform (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const nanErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('NaN')) {
        nanErrors.push(message.text().slice(0, 120));
      }
    });
    await page.route('**/trpc/realtime.coordinates**', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.result.data.json = [MARKER];
      await route.fulfill({ response, json: body });
    });
    await page.goto('/acme/acme-web/realtime');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `test-results/verify-b/shots/item6-realtime-${name}.png`,
    });
    const transforms = await page
      .locator('.rsm-zoomable-group')
      .evaluateAll((groups) => groups.map((g) => g.getAttribute('transform')));
    expect(nanErrors).toEqual([]);
    for (const transform of transforms) {
      expect(transform).not.toContain('NaN');
    }
  });
}
