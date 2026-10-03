import { describe, expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import type { Install } from '../src/doctor/types';
import { EnvFile } from '../src/env-file';
import {
  SUPPORTER_URL,
  shouldShowSupportBanner,
  supportBannerText,
} from '../src/support-banner';
import { templates } from '../src/templates';

const install = (): Install => ({
  compose: parseDocument(templates.compose),
  env: new EnvFile(''),
  caddyfile: null,
  files: new Map(),
  fileKind: () => 'file',
});

const context = (
  overrides: Partial<Parameters<typeof shouldShowSupportBanner>[0]> = {}
) => ({
  install: install(),
  isTerminal: true,
  env: {},
  loggedIn: () => false,
  ...overrides,
});

describe('support banner', () => {
  test('shows for a public install in a terminal', () => {
    expect(shouldShowSupportBanner(context())).toBe(true);
    expect(shouldShowSupportBanner(context({ install: null }))).toBe(true);
  });

  test('never for supporters: supporter images, or logged in to the supporter registry', () => {
    const supporterInstall = install();
    supporterInstall.compose.setIn(
      ['services', 'op-api', 'image'],
      'docker.openpanel.dev/openpanel-dev/api:3.1.9'
    );
    expect(
      shouldShowSupportBanner(context({ install: supporterInstall }))
    ).toBe(false);
    expect(shouldShowSupportBanner(context({ loggedIn: () => true }))).toBe(
      false
    );
  });

  test('never in CI, pipes or when opted out', () => {
    expect(shouldShowSupportBanner(context({ env: { CI: 'true' } }))).toBe(
      false
    );
    expect(shouldShowSupportBanner(context({ isTerminal: false }))).toBe(false);
    expect(
      shouldShowSupportBanner(
        context({ env: { OPENPANEL_NO_SUPPORT_BANNER: '1' } })
      )
    ).toBe(false);
  });

  test('links the supporter page', () => {
    expect(supportBannerText()).toContain(SUPPORTER_URL);
  });
});
