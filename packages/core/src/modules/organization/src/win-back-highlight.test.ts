// Asserts the gating and fallback decisions, which are the point of the module:
// a highlight is a bonus, never a reason an email fails or embarrasses us with
// tiny numbers. The stats lookups and the AI call are injected stubs — no
// `mock.module`, so every assertion is on a call the code under test made.

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Logger } from '../../../logger';
import {
  buildWinBackHighlight,
  type HighlightOverview,
  type HighlightTopPage,
  type WinBackHighlightDeps,
} from './win-back-highlight';

const project = { id: 'project-1', name: 'acme-web' };

function stubLogger(): Logger {
  const noop = () => undefined;
  const logger: Logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}

const getAnalyticsOverview = mock(
  async (): Promise<HighlightOverview> => ({ summary: {}, series: [] })
);
const getTopPages = mock(async (): Promise<HighlightTopPage[]> => []);
const generatePitch = mock(async () => '');

function deps(): WinBackHighlightDeps {
  return {
    logger: stubLogger(),
    getAnalyticsOverview,
    getTopPages,
    generatePitch,
  };
}

beforeEach(() => {
  getAnalyticsOverview.mockClear().mockResolvedValue({
    summary: { unique_visitors: 12_400 },
    series: [
      { date: '2026-08-01', unique_visitors: 300 },
      { date: '2026-08-12', unique_visitors: 840 },
      { date: '2026-08-20', unique_visitors: 500 },
    ],
  });
  getTopPages
    .mockClear()
    .mockResolvedValue([{ path: '/pricing', sessions: 2100 }]);
  generatePitch
    .mockClear()
    .mockResolvedValue('acme-web had a strong month with 12,400 visitors.');
});

describe('buildWinBackHighlight', () => {
  it('returns the AI pitch built from the collected facts', async () => {
    const highlight = await buildWinBackHighlight(
      { project, recentEventsCount: 50_000 },
      deps()
    );

    expect(highlight).toBe('acme-web had a strong month with 12,400 visitors.');
    expect(generatePitch).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'acme-web',
        uniqueVisitors: 12_400,
        busiestDay: { date: 'August 12', visitors: 840 },
        topPage: { path: '/pricing', sessions: 2100 },
      })
    );
  });

  it('skips low-volume orgs entirely — tiny facts undercut the email', async () => {
    const highlight = await buildWinBackHighlight(
      { project, recentEventsCount: 999 },
      deps()
    );

    expect(highlight).toBeUndefined();
    expect(getAnalyticsOverview).not.toHaveBeenCalled();
    expect(generatePitch).not.toHaveBeenCalled();
  });

  it('skips when there is no project to pull facts from', async () => {
    const highlight = await buildWinBackHighlight(
      { project: null, recentEventsCount: 50_000 },
      deps()
    );

    expect(highlight).toBeUndefined();
  });

  it('falls back to a deterministic sentence when the AI call fails', async () => {
    generatePitch.mockRejectedValue(new Error('rate limited'));

    const highlight = await buildWinBackHighlight(
      { project, recentEventsCount: 50_000 },
      deps()
    );

    expect(highlight).toContain('acme-web had 12,400 visitors');
    expect(highlight).toContain('August 12');
    expect(highlight).toContain('/pricing');
  });

  it('falls back when the AI returns an empty pitch', async () => {
    generatePitch.mockResolvedValue('   ');

    const highlight = await buildWinBackHighlight(
      { project, recentEventsCount: 50_000 },
      deps()
    );

    expect(highlight).toContain('acme-web had 12,400 visitors');
  });

  it('returns nothing when the stats queries fail — the email still goes out', async () => {
    getAnalyticsOverview.mockRejectedValue(new Error('ch down'));

    const highlight = await buildWinBackHighlight(
      { project, recentEventsCount: 50_000 },
      deps()
    );

    expect(highlight).toBeUndefined();
    expect(generatePitch).not.toHaveBeenCalled();
  });

  it('returns nothing for a window with zero visitors', async () => {
    getAnalyticsOverview.mockResolvedValue({
      summary: { unique_visitors: 0 },
      series: [],
    });

    const highlight = await buildWinBackHighlight(
      { project, recentEventsCount: 50_000 },
      deps()
    );

    expect(highlight).toBeUndefined();
  });
});
