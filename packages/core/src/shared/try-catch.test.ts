// Subject moved to @openpanel/shared (M15-010, ADR-022 R21); the suite did
// not follow it. Nothing runs a `test` script in packages/shared yet — the
// root `test` script names its four workspaces explicitly and root
// package.json was outside M15-010's scope — so moving this file would take
// it out of every gate. Move it when that line can gain the filter.
import { describe, expect, test } from 'bun:test';
import { tryCatch } from '@openpanel/shared';

describe('tryCatch', () => {
  test('wraps a resolved promise', async () => {
    const result = await tryCatch(Promise.resolve(42));
    expect(result).toEqual({ ok: true, data: 42, error: null });
  });

  test('wraps the result of a resolving function', async () => {
    const result = await tryCatch(async () => 'value');
    expect(result).toEqual({ ok: true, data: 'value', error: null });
  });

  test('captures a rejected promise', async () => {
    const error = new Error('boom');
    const result = await tryCatch(Promise.reject(error));
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBe(error);
  });

  test('captures a throw from inside a function input', async () => {
    const result = await tryCatch(async () => {
      throw new Error('nope');
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('nope');
  });
});
