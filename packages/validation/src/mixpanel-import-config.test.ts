import { describe, expect, it } from 'vitest';
import { zMixpanelImportConfig } from './index';

const BASE = {
  provider: 'mixpanel' as const,
  type: 'api' as const,
  serviceAccount: 'sa',
  serviceSecret: 'ss',
  projectId: '123',
  from: '2025-01-01',
  to: '2025-01-02',
};

describe('zMixpanelImportConfig timezone', () => {
  it('accepts a valid IANA name', () => {
    expect(
      zMixpanelImportConfig.safeParse({ ...BASE, timezone: 'Europe/Stockholm' })
        .success
    ).toBe(true);
  });

  it('accepts an absent timezone', () => {
    expect(zMixpanelImportConfig.safeParse({ ...BASE }).success).toBe(true);
  });

  it('rejects a typo\'d timezone rather than importing it unconverted', () => {
    // Without this, projectTimeToUtc's own try/catch fallback swallows the
    // typo and imports every timestamp unconverted -- exactly the bug the
    // timezone field exists to fix, just silently.
    const result = zMixpanelImportConfig.safeParse({
      ...BASE,
      timezone: 'Europe/Stokholm',
    });
    expect(result.success).toBe(false);
  });
});
