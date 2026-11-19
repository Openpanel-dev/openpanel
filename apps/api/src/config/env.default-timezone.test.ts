import { describe, expect, it, spyOn } from 'bun:test';
import { loadConfig } from './env';

describe('DEFAULT_TIMEZONE', () => {
  it('uses UTC without warning when unset, empty or blank', () => {
    const warning = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      for (const value of [undefined, '', '  ']) {
        expect(
          loadConfig({ DEFAULT_TIMEZONE: value }).core.defaultTimezone
        ).toBe('UTC');
      }
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('passes the configured timezone to every process role', () => {
    for (const role of ['api', 'worker', 'all']) {
      expect(
        loadConfig({ ROLE: role, DEFAULT_TIMEZONE: 'Asia/Riyadh' }).core
          .defaultTimezone
      ).toBe('Asia/Riyadh');
    }
  });

  it('warns once per load and falls back without echoing invalid input', () => {
    const warning = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      for (const value of [
        'Asia/Ryiadh',
        'local',
        'UTC+3',
        '+03:00',
        'utc',
        'America/Coyhaique',
        ' Asia/Riyadh ',
      ]) {
        warning.mockClear();
        expect(
          loadConfig({ DEFAULT_TIMEZONE: value }).core.defaultTimezone
        ).toBe('UTC');
        expect(warning).toHaveBeenCalledTimes(1);
        expect(warning).toHaveBeenCalledWith(
          'Invalid DEFAULT_TIMEZONE, falling back to UTC'
        );
      }
    } finally {
      warning.mockRestore();
    }
  });

  it('keeps independently loaded configurations isolated', () => {
    const riyadh = loadConfig({ DEFAULT_TIMEZONE: 'Asia/Riyadh' });
    const utc = loadConfig({ DEFAULT_TIMEZONE: 'UTC' });
    expect(riyadh.core.defaultTimezone).toBe('Asia/Riyadh');
    expect(utc.core.defaultTimezone).toBe('UTC');
    expect(loadConfig({}).core.defaultTimezone).toBe('UTC');
    expect(riyadh.core.defaultTimezone).toBe('Asia/Riyadh');
  });
});
