import { expect, test } from 'bun:test';
import { getChartStartEndDate } from '../../../report/src/chart-dates';
import { chatRunContext } from '../run-context';
import { getReferenceDateWindow } from './references';

const RUN_CONTEXT = {
  userId: 'user_1',
  projectId: 'proj_1',
  organizationId: 'org_1',
  timezone: 'Europe/Stockholm',
};

test('a preset range yields valid bounds matching the chart window', () => {
  const window = chatRunContext.run(RUN_CONTEXT, () =>
    getReferenceDateWindow({ range: '7d' })
  );
  const chartWindow = getChartStartEndDate(
    { range: '7d', startDate: null, endDate: null },
    RUN_CONTEXT.timezone
  );

  expect(Number.isNaN(window.gte.getTime())).toBe(false);
  expect(Number.isNaN(window.lte.getTime())).toBe(false);
  expect(window.gte).toEqual(new Date(chartWindow.startDate));
  expect(window.lte).toEqual(new Date(chartWindow.endDate));
});

test('explicit dates cover the whole of both days like the chart window', () => {
  const window = getReferenceDateWindow({
    startDate: '2026-09-01',
    endDate: '2026-09-10',
  });
  const chartWindow = getChartStartEndDate(
    { range: '30d', startDate: '2026-09-01', endDate: '2026-09-10' },
    'UTC'
  );

  expect(window.gte).toEqual(new Date(chartWindow.startDate));
  expect(window.lte).toEqual(new Date(chartWindow.endDate));
});

test('a start date alone runs to today', () => {
  const window = getReferenceDateWindow({ startDate: '2026-09-01' });

  expect(window.gte).toEqual(new Date('2026-09-01 00:00:00'));
  expect(window.lte.getTime()).toBeGreaterThan(Date.now() - 86_400_000);
});
