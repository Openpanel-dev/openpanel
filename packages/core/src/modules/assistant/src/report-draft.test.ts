// No model call: `proposalToDraft` is the pure half, the shape the editor loads.

import { describe, expect, test } from 'bun:test';
import { proposalToDraft, type ReportDraftProposal } from './report-draft';

const PROJECT_ID = 'p1';
const TIMEZONE = 'UTC';

const purchases: ReportDraftProposal = {
  title: 'Purchases by device',
  chartType: 'linear',
  interval: 'day',
  series: [{ type: 'event', name: 'purchase', segment: 'event', filters: [] }],
  breakdowns: [{ name: 'device' }],
  summary: 'Purchases per day by device.',
};

describe('proposalToDraft', () => {
  test('a preset range is stored as the range with no dates', () => {
    const built = proposalToDraft(PROJECT_ID, TIMEZONE, {
      ...purchases,
      range: '7d',
    });
    expect('draft' in built).toBe(true);
    if (!('draft' in built)) {
      return;
    }
    expect(built.draft.range).toBe('7d');
    expect(built.draft.startDate).toBeNull();
    expect(built.draft.endDate).toBeNull();
    expect(built.draft.name).toBe('Purchases by device');
    expect(built.draft.projectId).toBe(PROJECT_ID);
    expect(built.draft.series[0]?.id).toBe('A');
    expect(built.draft.breakdowns).toEqual([{ id: '1', name: 'device' }]);
  });

  test('defaults to the last 30 days when the model picks no window', () => {
    const built = proposalToDraft(PROJECT_ID, TIMEZONE, purchases);
    expect('draft' in built && built.draft.range).toBe('30d');
  });

  test('explicit dates become a custom range', () => {
    const built = proposalToDraft(PROJECT_ID, TIMEZONE, {
      ...purchases,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect('draft' in built).toBe(true);
    if (!('draft' in built)) {
      return;
    }
    expect(built.draft.range).toBe('custom');
    expect(built.draft.startDate).toBe('2026-08-01');
    expect(built.draft.endDate).toBe('2026-08-31');
  });

  test('an interval too fine for the window is snapped like the range picker does', () => {
    const hourly = proposalToDraft(PROJECT_ID, TIMEZONE, {
      ...purchases,
      range: '3m',
      interval: 'hour',
    });
    expect('draft' in hourly && hourly.draft.interval).toBe('day');
    const minutely = proposalToDraft(PROJECT_ID, TIMEZONE, {
      ...purchases,
      range: 'today',
      interval: 'minute',
    });
    expect('draft' in minutely && minutely.draft.interval).toBe('hour');
  });

  test('an invalid proposal comes back as issues the model can fix', () => {
    const built = proposalToDraft(PROJECT_ID, TIMEZONE, {
      ...purchases,
      series: [{ type: 'formula', formula: 'A ; drop' }],
    });
    expect('error' in built).toBe(true);
  });
});
