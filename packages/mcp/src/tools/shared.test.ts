import { resolveClientProjectId } from '@openpanel/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpAuthContext } from '../auth';
import { MAX_RESPONSE_CHARS, resolveDateRange, table, toText } from './shared';

const READ_CTX: McpAuthContext = {
  projectId: 'proj-abc',
  organizationId: 'org-1',
  clientType: 'read',
};

const ROOT_CTX: McpAuthContext = {
  projectId: null,
  organizationId: 'org-1',
  clientType: 'root',
};

describe('resolveDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes through explicit dates unchanged', () => {
    const result = resolveDateRange('2024-01-01', '2024-02-28');
    expect(result).toEqual({ startDate: '2024-01-01', endDate: '2024-02-28' });
  });

  it('defaults endDate to today when omitted', () => {
    const { endDate } = resolveDateRange('2024-01-01');
    expect(endDate).toBe('2024-03-15');
  });

  it('defaults startDate to 30 days ago when omitted', () => {
    const { startDate } = resolveDateRange(undefined, '2024-03-15');
    expect(startDate).toBe('2024-02-14');
  });

  it('defaults both to last 30 days when neither is provided', () => {
    const result = resolveDateRange();
    expect(result.endDate).toBe('2024-03-15');
    expect(result.startDate).toBe('2024-02-14');
  });
});

describe('resolveClientProjectId', () => {
  it('returns the context projectId for read clients, ignoring any input', async () => {
    await expect(resolveClientProjectId({
      clientType: READ_CTX.clientType,
      clientProjectId: READ_CTX.projectId,
      organizationId: READ_CTX.organizationId,
      inputProjectId: undefined,
    })).resolves.toBe('proj-abc');
    await expect(resolveClientProjectId({
      clientType: READ_CTX.clientType,
      clientProjectId: READ_CTX.projectId,
      organizationId: READ_CTX.organizationId,
      inputProjectId: 'other-proj',
    })).resolves.toBe('proj-abc');
  });

  it('throws for root clients when no projectId is provided', async () => {
    await expect(resolveClientProjectId({
      clientType: ROOT_CTX.clientType,
      clientProjectId: ROOT_CTX.projectId,
      organizationId: ROOT_CTX.organizationId,
      inputProjectId: undefined,
    })).rejects.toThrow('projectId is required');
  });
});

describe('table', () => {
  const rows = [
    { name: 'Google', sessions: 100, pageviews: 500, rate: 0.5 },
    { name: 'GitHub', sessions: 50, pageviews: 200, rate: 0.4 },
    { name: 'Reddit', sessions: 10, pageviews: 20, rate: 0.9 },
    { name: 'Hacker News', sessions: 1, pageviews: 2, rate: 0.1 },
  ];

  it('emits columns once and rows positionally', () => {
    const result = table(rows, { limit: 10 });
    expect(result.columns).toEqual(['name', 'sessions', 'pageviews', 'rate']);
    expect(result.rows[0]).toEqual(['Google', 100, 500, 0.5]);
    expect(result.total_rows).toBe(4);
    expect(result.note).toBeUndefined();
  });

  it('honours an explicit column order and drops unlisted fields', () => {
    const result = table(rows, { limit: 10, columns: ['sessions', 'name'] });
    expect(result.columns).toEqual(['sessions', 'name']);
    expect(result.rows[0]).toEqual([100, 'Google']);
  });

  it('rolls the tail into an (other) row that keeps totals reconcilable', () => {
    const result = table(rows, {
      limit: 2,
      sum: ['sessions', 'pageviews'],
      unit: 'sources',
    });
    // 2 kept rows + 1 rollup row
    expect(result.rows).toHaveLength(3);
    expect(result.total_rows).toBe(4);
    const other = result.rows[2] as unknown[];
    expect(other[0]).toBe('(other: 2 sources)');
    expect(other[1]).toBe(11); // 10 + 1 sessions
    expect(other[2]).toBe(22); // 20 + 2 pageviews
    // The head plus the rollup accounts for every session.
    const totalSessions = result.rows.reduce(
      (acc, row) => acc + (row[1] as number),
      0
    );
    expect(totalSessions).toBe(161);
  });

  it('leaves non-additive columns null on the rollup row rather than summing them', () => {
    const result = table(rows, { limit: 2, sum: ['sessions'] });
    const other = result.rows[2] as unknown[];
    // `rate` is an average — summing it would be a confident lie.
    expect(other[3]).toBeNull();
    expect(other[2]).toBeNull(); // pageviews not declared additive either
  });

  it('notes the omission when no additive columns are declared', () => {
    const result = table(rows, { limit: 2, unit: 'sources' });
    expect(result.rows).toHaveLength(2);
    expect(result.note).toContain('The remaining 2 were omitted');
  });

  it('warns that a SQL-capped result is not the full set', () => {
    const result = table(rows, { limit: 4, unit: 'pages', moreAvailable: true });
    expect(result.rows).toHaveLength(4);
    expect(result.note).toContain('capped query');
  });

  it('handles an empty result without inventing columns', () => {
    const result = table([], { limit: 10 });
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.total_rows).toBe(0);
  });
});

describe('toText', () => {
  const parse = (data: unknown) =>
    JSON.parse(toText(data).content[0].text) as Record<string, unknown>;

  it('serializes compactly — no indentation', () => {
    const { text } = toText({ a: 1, b: [1, 2] }).content[0];
    expect(text).toBe('{"a":1,"b":[1,2]}');
  });

  it('shrinks an oversized table instead of returning it whole', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      name: `source-number-${i}-with-a-fairly-long-label`,
      sessions: i,
    }));
    const oversized = table(rows, { limit: 5000 });
    const { text } = toText(oversized).content[0];
    expect(text.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    const parsed = JSON.parse(text) as { rows: unknown[]; note: string };
    expect(parsed.rows.length).toBeLessThan(5000);
    expect(parsed.note).toContain('fit the response size limit');
  });

  it('shrinks a table nested inside a wrapper object', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      path: `/some/quite/long/path/segment/${i}`,
      sessions: i,
    }));
    const parsed = parse({
      summary: { total: 5000 },
      pages: table(rows, { limit: 5000 }),
    }) as { summary: unknown; pages: { rows: unknown[] } };
    expect(parsed.summary).toEqual({ total: 5000 });
    expect(parsed.pages.rows.length).toBeLessThan(5000);
  });

  it('degrades to a explanatory error when nothing is shrinkable', () => {
    const parsed = parse({ blob: 'x'.repeat(MAX_RESPONSE_CHARS + 1) });
    expect(parsed.error).toBe('response_too_large');
    expect(parsed.message).toContain('Narrow the request');
  });
});
