import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpAuthContext } from '../auth';
import { resolveDateRange, resolveProjectId } from './shared';

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

describe('resolveProjectId', () => {
  it('returns the context projectId for read clients, ignoring any input', () => {
    expect(resolveProjectId(READ_CTX, undefined)).toBe('proj-abc');
    expect(resolveProjectId(READ_CTX, 'other-proj')).toBe('proj-abc');
  });

  it('returns the input projectId for root clients', () => {
    expect(resolveProjectId(ROOT_CTX, 'proj-xyz')).toBe('proj-xyz');
  });

  it('throws for root clients when no projectId is provided', () => {
    expect(() => resolveProjectId(ROOT_CTX, undefined)).toThrow(
      'projectId is required',
    );
  });
});
