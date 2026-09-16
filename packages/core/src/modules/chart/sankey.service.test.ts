/**
 * `chart.sankey`'s window bound (M25 Group C fix 9, §12 fix 9).
 *
 * Both sankey statements scan every event in the range and hold one
 * `groupArray` per session, so the `12m`/`lastYear` the range picker offers
 * costs ~22 s and ~11.8 GiB per statement on a busy tenant — twice per call.
 * Those windows are refused, not quietly shortened.
 *
 * The bound belongs to the `chart.sankey` procedure specifically, so the
 * endpoint case below drives `getSankeyChart` rather than `getSankey`: the
 * REST, MCP and assistant surfaces reach `getSankey` through
 * `getUserFlowCore` with caller-supplied dates and are outside fix 9's
 * endpoint list.
 */

import { describe, expect, it } from 'bun:test';
import { TRPCError } from '@trpc/server';
import { testServiceDeps } from '../../../test/service-deps';
import type { ServiceDeps } from '../../services';
import { zReportInput } from '../report/report.constants';
import { MAX_SANKEY_WINDOW_DAYS } from './chart.constants';
import { getSankeyChart } from './chart.service';
import { assertSankeyWindowIsAnswerable } from './sankey.service';

const PROJECT_ID = 'sankey-window-bound-test';
const START_DATE = '2026-01-01 00:00:00';
const MILLISECONDS_PER_DAY = 86_400_000;
const STEPS = 3;
const TWELVE_MONTHS_IN_DAYS = 365;

function clickhouseDate(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace('T', ' ').slice(0, 19);
}

function endOfWindow(days: number): string {
  const start = new Date(`${START_DATE.replace(' ', 'T')}Z`).getTime();
  return clickhouseDate(start + days * MILLISECONDS_PER_DAY);
}

function windowOf(days: number): void {
  assertSankeyWindowIsAnswerable(START_DATE, endOfWindow(days));
}

function caught(run: () => void): TRPCError {
  try {
    run();
  } catch (thrown) {
    return thrown as TRPCError;
  }
  throw new Error('expected the window bound to reject');
}

/** Postgres answers the timezone lookup; any ClickHouse contact is a failure,
 *  since the point of the bound is that the statements are never built. */
function depsRefusingClickhouse(): Promise<ServiceDeps> {
  return testServiceDeps({
    db: {
      project: {
        findUniqueOrThrow: () =>
          Promise.resolve({ organization: { timezone: 'UTC' } }),
      },
    },
    ch: new Proxy(
      {},
      {
        get() {
          throw new Error('ClickHouse was reached despite the window bound');
        },
      }
    ),
  } as unknown as Partial<ServiceDeps>);
}

describe('assertSankeyWindowIsAnswerable', () => {
  it(`answers the widest window "3m" can produce (${MAX_SANKEY_WINDOW_DAYS} days)`, () => {
    expect(() => windowOf(MAX_SANKEY_WINDOW_DAYS)).not.toThrow();
  });

  it('refuses a longer window with an explained bad request', () => {
    const error = caught(() => windowOf(MAX_SANKEY_WINDOW_DAYS + 1));

    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toContain(`at most ${MAX_SANKEY_WINDOW_DAYS} days`);
    expect(error.message).toContain(`covers ${MAX_SANKEY_WINDOW_DAYS + 1}`);
  });

  it("refuses the range picker's 12-month option", () => {
    expect(caught(() => windowOf(TWELVE_MONTHS_IN_DAYS)).code).toBe(
      'BAD_REQUEST'
    );
  });

  it('leaves an unparseable range to the statement to reject', () => {
    expect(() =>
      assertSankeyWindowIsAnswerable('not-a-date', 'also-not-a-date')
    ).not.toThrow();
  });
});

describe('chart.sankey applies the window bound', () => {
  it('refuses a 12-month report before any query is built', async () => {
    const deps = await depsRefusingClickhouse();

    const input = zReportInput.parse({
      projectId: PROJECT_ID,
      startDate: START_DATE,
      endDate: endOfWindow(TWELVE_MONTHS_IN_DAYS),
      range: 'custom',
      chartType: 'sankey',
      interval: 'day',
      breakdowns: [],
      series: [
        {
          type: 'event',
          id: 'A',
          name: 'screen_view',
          displayName: 'screen_view',
          segment: 'event',
          filters: [],
        },
      ],
      options: { type: 'sankey', mode: 'after', steps: STEPS, exclude: [] },
    });

    const error = await getSankeyChart(deps, input).catch(
      (thrown: unknown) => thrown
    );

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe('BAD_REQUEST');
  });
});
