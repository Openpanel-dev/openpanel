import { describe, expect, it } from 'vitest';
import {
  getClientIpFromHeaders,
  getTrustedIpFromHeaders,
} from './get-client-ip';

describe('getTrustedIpFromHeaders', () => {
  it('prefers cf-connecting-ip over anything the caller can set', () => {
    // Verified against production: Cloudflare overwrites cf-connecting-ip, but
    // passes a forged x-forwarded-for / x-client-ip straight through.
    const headers = {
      'x-client-ip': '9.9.9.9',
      'x-forwarded-for': '8.8.8.8',
      'cf-connecting-ip': '98.128.229.56',
    };

    expect(getTrustedIpFromHeaders(headers)).toEqual({
      ip: '98.128.229.56',
      header: 'cf-connecting-ip',
    });

    // The analytics resolver deliberately trusts the caller - that is the
    // difference the two functions exist for.
    expect(getClientIpFromHeaders(headers).ip).toBe('9.9.9.9');
  });

  it('never returns a client-forwarded header', () => {
    expect(
      getTrustedIpFromHeaders({
        'openpanel-client-ip': '9.9.9.9',
        'x-client-ip': '7.7.7.7',
        'true-client-ip': '6.6.6.6',
      }).ip,
    ).toBe('');
  });

  it('takes the last x-forwarded-for entry, the one the proxy appended', () => {
    expect(
      getTrustedIpFromHeaders({ 'x-forwarded-for': '8.8.8.8, 1.2.3.4' }),
    ).toEqual({ ip: '1.2.3.4', header: 'x-forwarded-for' });
  });

  it('falls back to the socket address, private ranges included', () => {
    expect(getTrustedIpFromHeaders({}, '127.0.0.1')).toEqual({
      ip: '127.0.0.1',
      header: 'socket',
    });
  });

  it('returns nothing when there is neither a trusted header nor a socket', () => {
    expect(getTrustedIpFromHeaders({})).toEqual({ ip: '', header: '' });
  });
});
