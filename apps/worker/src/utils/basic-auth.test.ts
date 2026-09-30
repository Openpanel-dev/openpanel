import { describe, expect, it, vi } from 'vitest';
import { basicAuth } from './basic-auth';

function run(header?: string) {
  const req = { headers: { authorization: header } } as never;
  const res = { set: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn() };
  const next = vi.fn();
  basicAuth('ops', 's3cret')(req, res as never, next);
  return { res, next };
}

const encode = (s: string) => `Basic ${Buffer.from(s).toString('base64')}`;

describe('basicAuth', () => {
  it('lets the right credentials through', () => {
    const { next, res } = run(encode('ops:s3cret'));
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a missing header', () => {
    const { next, res } = run(undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.set).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('Basic'));
  });

  it('rejects a wrong password, wrong user and malformed value', () => {
    for (const header of [encode('ops:nope'), encode('root:s3cret'), encode('no-colon'), 'Bearer abc']) {
      const { next, res } = run(header);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });

  it('allows a colon inside the password', () => {
    const req = { headers: { authorization: encode('ops:a:b') } } as never;
    const res = { set: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn() };
    const next = vi.fn();
    basicAuth('ops', 'a:b')(req, res as never, next);
    expect(next).toHaveBeenCalled();
  });
});
