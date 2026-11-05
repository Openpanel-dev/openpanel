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

  it('keeps reserved characters in a filter name', () => {
    const filters = [
      { id: 'a', name: 'properties.a,b;c%d', operator: 'is', value: ['x'] },
      { id: 'country', name: 'country', operator: 'is', value: ['SE'] },
    ] as const;
    const query = serialize(filters as never);

    expect(query).toBe('properties.a%2Cb%3Bc%25d,is,x;country,is,SE');
    expect(parse(query)?.map((filter) => filter.name)).toEqual([
      'properties.a,b;c%d',
      'country',
    ]);
  });

  it('still reads an old link with a stray percent in a name', () => {
    const query = 'properties.100%,is,x;cohort:abc,inCohort,';

    expect(parse(query)?.map((filter) => filter.name)).toEqual([
      'properties.100%',
      'cohort:abc',
    ]);
  });

  it('leaves links without a type unchanged', () => {
    const query = 'country,is,SE;cohort,inCohort,,abc';

    expect(serialize(parse(query) ?? [])).toBe(query);
  });
});
