import { expect, mock, test } from 'bun:test';
import {
  bindReadsToSignal,
  CANCEL_ON_CLIENT_CLOSE_SETTINGS,
} from './ch-abortable';
import type { ClickHouseClient } from './context';

function fakeClient() {
  const query = mock(async (_params: unknown) => 'result');
  const insert = mock(async (_params: unknown) => 'inserted');
  const client = { query, insert } as unknown as ClickHouseClient;
  return { client, query, insert };
}

test('a read carries the signal and the cancel-on-close settings', async () => {
  const { client, query } = fakeClient();
  const controller = new AbortController();

  await bindReadsToSignal(client, controller.signal).query({
    query: 'SELECT 1',
    clickhouse_settings: { max_threads: 2 },
  });

  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0]?.[0]).toEqual({
    query: 'SELECT 1',
    abort_signal: controller.signal,
    clickhouse_settings: {
      ...CANCEL_ON_CLIENT_CLOSE_SETTINGS,
      max_threads: 2,
    },
  });
});

test('a caller setting wins over the defaults', async () => {
  const { client, query } = fakeClient();

  await bindReadsToSignal(client, new AbortController().signal).query({
    query: 'SELECT 1',
    clickhouse_settings: { cancel_http_readonly_queries_on_client_close: 0 },
  });

  expect(
    (query.mock.calls[0]?.[0] as { clickhouse_settings: object })
      .clickhouse_settings
  ).toMatchObject({ cancel_http_readonly_queries_on_client_close: 0 });
});

test('a read after the abort never reaches ClickHouse', () => {
  const { client, query } = fakeClient();
  const controller = new AbortController();
  const reason = new Error('gone');
  controller.abort(reason);

  expect(() =>
    bindReadsToSignal(client, controller.signal).query({ query: 'SELECT 1' })
  ).toThrow(reason);
  expect(query).not.toHaveBeenCalled();
});

test('writes pass through untouched', async () => {
  const { client, insert } = fakeClient();
  const params = { table: 'events', values: [], format: 'JSONEachRow' };

  await bindReadsToSignal(client, new AbortController().signal).insert(
    params as never
  );

  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert.mock.calls[0]?.[0]).toBe(params);
});
