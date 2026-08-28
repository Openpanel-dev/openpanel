/**
 * The stats services and the AI call are mocked — these assert the gating and
 * fallback decisions, which are the point of the module: a highlight is a
 * bonus, never a reason an email fails or embarrasses us with tiny numbers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAnalyticsOverviewCoreMock,
  getTopPagesCoreMock,
  generateWinBackPitchMock,
} = vi.hoisted(() => ({
  getAnalyticsOverviewCoreMock: vi.fn(),
  getTopPagesCoreMock: vi.fn(),
  generateWinBackPitchMock: vi.fn(),
}));

vi.mock('@openpanel/db', () => ({
  getAnalyticsOverviewCore: getAnalyticsOverviewCoreMock,
  getTopPagesCore: getTopPagesCoreMock,
}));
vi.mock('@openpanel/ai', () => ({
  generateWinBackPitch: generateWinBackPitchMock,
}));

import { buildWinBackHighlight } from './win-back-highlight';

const project = { id: 'project-1', name: 'acme-web' };

beforeEach(() => {
  vi.clearAllMocks();
  getAnalyticsOverviewCoreMock.mockResolvedValue({
    summary: { unique_visitors: 12_400 },
    series: [
      { date: '2026-08-01', unique_visitors: 300 },
      { date: '2026-08-12', unique_visitors: 840 },
      { date: '2026-08-20', unique_visitors: 500 },
    ],
  });
  getTopPagesCoreMock.mockResolvedValue([
    { path: '/pricing', sessions: 2100, pageviews: 3400 },
  ]);
  generateWinBackPitchMock.mockResolvedValue(
    'acme-web had a strong month with 12,400 visitors.',
  );
});

describe('buildWinBackHighlight', () => {
  it('returns the AI pitch built from the collected facts', async () => {
    const highlight = await buildWinBackHighlight({
      project,
      recentEventsCount: 50_000,
    });

    expect(highlight).toBe('acme-web had a strong month with 12,400 visitors.');
    expect(generateWinBackPitchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'acme-web',
        uniqueVisitors: 12_400,
        busiestDay: { date: 'August 12', visitors: 840 },
        topPage: { path: '/pricing', sessions: 2100 },
      }),
    );
  });

  it('skips low-volume orgs entirely — tiny facts undercut the email', async () => {
    const highlight = await buildWinBackHighlight({
      project,
      recentEventsCount: 999,
    });

    expect(highlight).toBeUndefined();
    expect(getAnalyticsOverviewCoreMock).not.toHaveBeenCalled();
    expect(generateWinBackPitchMock).not.toHaveBeenCalled();
  });

  it('skips when there is no project to pull facts from', async () => {
    const highlight = await buildWinBackHighlight({
      project: null,
      recentEventsCount: 50_000,
    });

    expect(highlight).toBeUndefined();
  });

  it('falls back to a deterministic sentence when the AI call fails', async () => {
    generateWinBackPitchMock.mockRejectedValue(new Error('rate limited'));

    const highlight = await buildWinBackHighlight({
      project,
      recentEventsCount: 50_000,
    });

    expect(highlight).toContain('acme-web had 12,400 visitors');
    expect(highlight).toContain('August 12');
    expect(highlight).toContain('/pricing');
  });

  it('falls back when the AI returns an empty pitch', async () => {
    generateWinBackPitchMock.mockResolvedValue('   ');

    const highlight = await buildWinBackHighlight({
      project,
      recentEventsCount: 50_000,
    });

    expect(highlight).toContain('acme-web had 12,400 visitors');
  });

  it('returns nothing when the stats queries fail — the email still goes out', async () => {
    getAnalyticsOverviewCoreMock.mockRejectedValue(new Error('ch down'));

    const highlight = await buildWinBackHighlight({
      project,
      recentEventsCount: 50_000,
    });

    expect(highlight).toBeUndefined();
    expect(generateWinBackPitchMock).not.toHaveBeenCalled();
  });

  it('returns nothing for a window with zero visitors', async () => {
    getAnalyticsOverviewCoreMock.mockResolvedValue({
      summary: { unique_visitors: 0 },
      series: [],
    });

    const highlight = await buildWinBackHighlight({
      project,
      recentEventsCount: 50_000,
    });

    expect(highlight).toBeUndefined();
  });
});
