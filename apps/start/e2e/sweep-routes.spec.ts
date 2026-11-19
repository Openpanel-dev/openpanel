import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import {
  attachRecorder,
  ORGANIZATION_ROUTES,
  OUTPUT_DIR,
  PROJECT_ROUTES,
  resolveProjectIds,
  resolveUrl,
  slug,
  type Visit,
  visit,
  visitClientSide,
  writeJson,
} from './sweep-helpers';

const SCREENSHOT_PROJECT = 'acme-shop';
const SWEEP_TIMEOUT_MS = 40 * 60 * 1000;

const EMPTY_IDS = {
  profile: null,
  session: null,
  group: null,
  cohort: null,
  dashboard: null,
  report: null,
};

function crashes(results: Visit[]) {
  return results
    .filter(
      (result) =>
        result.navigationError ||
        (result.status ?? 0) >= 500 ||
        result.pageErrors?.length ||
        result.state?.isBlank
    )
    .map((result) => ({
      url: result.url,
      status: result.status,
      pageErrors: result.pageErrors,
      navigationError: result.navigationError,
      blank: result.state?.isBlank,
    }));
}

test.describe('route sweep (direct load)', () => {
  test.setTimeout(SWEEP_TIMEOUT_MS);

  test('organization and global routes load without crashing', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    const results: Visit[] = [];
    for (const spec of ORGANIZATION_ROUTES) {
      const url = resolveUrl(spec, SCREENSHOT_PROJECT, EMPTY_IDS);
      if (!url) {
        continue;
      }
      results.push(
        await visit(
          page,
          recorder,
          { route: spec.route, project: '-' },
          url,
          resolve(
            OUTPUT_DIR,
            'shots',
            'desktop-light',
            `org-${slug(spec.route)}.png`
          )
        )
      );
    }
    writeJson('routes-organization.json', results);
    expect(crashes(results)).toEqual([]);
  });

  for (const projectId of ['acme-shop', 'acme-web', 'acme-saas', 'acme-app']) {
    test(`project routes load without crashing: ${projectId}`, async ({
      page,
    }) => {
      const recorder = attachRecorder(page);
      const ids = await resolveProjectIds(page.request, projectId);
      const results: Visit[] = [];
      for (const spec of PROJECT_ROUTES) {
        const url = resolveUrl(spec, projectId, ids);
        if (!url) {
          results.push({ route: spec.route, project: projectId, url: null });
          continue;
        }
        const screenshot =
          projectId === SCREENSHOT_PROJECT
            ? resolve(
                OUTPUT_DIR,
                'shots',
                'desktop-light',
                `${slug(spec.route)}.png`
              )
            : undefined;
        // A document load costs ~1200 dev-server module requests, so only the
        // screenshot project and each project's first route pay for one.
        const isDocumentLoad =
          projectId === SCREENSHOT_PROJECT || results.length === 0;
        const label = { route: spec.route, project: projectId };
        results.push(
          isDocumentLoad
            ? await visit(page, recorder, label, url, screenshot)
            : await visitClientSide(page, recorder, label, url)
        );
      }
      writeJson(`routes-${projectId}.json`, {
        ids,
        authTrail: recorder.authTrail,
        results,
      });
      expect(crashes(results)).toEqual([]);
    });
  }
});
