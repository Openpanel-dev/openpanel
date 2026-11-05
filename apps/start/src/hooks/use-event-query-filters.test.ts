import { describe, expect, it } from 'vitest';
import { eventQueryFiltersParser } from './use-event-query-filters';

const { parse, serialize } = eventQueryFiltersParser;

describe('eventQueryFiltersParser', () => {
  it('keeps a filter type through the URL', () => {
    const query = 'properties.price,gt,10,,number';
    const [filter] = parse(query) ?? [];

    expect(filter).toMatchObject({
      name: 'properties.price',
      operator: 'gt',
      value: ['10'],
      type: 'number',
    });
    expect(serialize(parse(query) ?? [])).toBe(query);
  });

  it('keeps a type next to cohort ids', () => {
    const query = 'cohort,inCohort,,abc|def,string';

    expect(parse(query)?.[0]).toMatchObject({
      cohortIds: ['abc', 'def'],
      type: 'string',
    });
    expect(serialize(parse(query) ?? [])).toBe(query);
  });

  it('reads percent sequences in a name literally, as old links wrote them', () => {
    const query = 'properties.a%2Cb,is,x;properties.100%25,is,y';

    expect(parse(query)?.map((filter) => filter.name)).toEqual([
      'properties.a%2Cb',
      'properties.100%25',
    ]);
    expect(serialize(parse(query) ?? [])).toBe(query);
  });

  it('leaves links without a type unchanged', () => {
    const query = 'country,is,SE;cohort,inCohort,,abc';

    expect(serialize(parse(query) ?? [])).toBe(query);
  });
});
