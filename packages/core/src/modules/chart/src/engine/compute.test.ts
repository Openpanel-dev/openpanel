import { describe, expect, it } from 'bun:test';
import { compute } from './compute';
import type { ConcreteSeries } from './types';

const series = (dates: string[]): ConcreteSeries =>
  ({
    id: 'a',
    definitionId: 'a',
    definitionIndex: 0,
    name: ['a'],
    context: { filters: [] },
    data: dates.map((date) => ({ date, count: 1 })),
    definition: { type: 'event', name: 'a', segment: 'event', filters: [] },
  }) as ConcreteSeries;

const definitions = [
  { type: 'event' as const, id: 'a' },
  { type: 'formula' as const, id: 'f', formula: 'A*2' },
];

const formulaDates = (result: ConcreteSeries[]) =>
  result.at(-1)?.data.map((point) => point.date);

describe('compute formula point order', () => {
  it('sorts real dates', () => {
    const result = compute([series(['2026-02-01', '2026-01-01'])], definitions);
    expect(formulaDates(result)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('keeps buckets in query order, even when labels parse as dates', () => {
    const result = compute([series(['6-10', '4-5', '11+'])], definitions, {
      datesAreBuckets: true,
    });
    expect(formulaDates(result)).toEqual(['6-10', '4-5', '11+']);
  });
});
