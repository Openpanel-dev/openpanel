import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UmamiProvider } from './umami';

/**
 * The umami provider fetches a caller-supplied `fileUrl`. Before
 * GHSA-cj2r-3x54-88h7 it used a bare `fetch`, which let any org member point it
 * at loopback, RFC1918 or 169.254.169.254 and read the upstream status back out
 * of `Import.errorMessage`. Both halves are covered here: the connection must
 * not happen, and nothing about the target may leak into the thrown message.
 */
describe('umami remote file SSRF guard', () => {
  let internalServer: http.Server;
  let internalPort: number;
  let hits: string[] = [];

  beforeAll(async () => {
    internalServer = http.createServer((req, res) => {
      hits.push(req.url ?? '');
      // A deliberately unmistakable status - if it ever surfaces in an error
      // message, the oracle is back.
      res.writeHead(418, { 'content-type': 'text/csv' });
      res.end('INTERNAL_ONLY_SECRET\n');
    });
    await new Promise<void>((resolve) =>
      internalServer.listen(0, '127.0.0.1', resolve),
    );
    internalPort = (internalServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => internalServer.close(() => resolve()));
  });

  const drain = async (fileUrl: string) => {
    const provider = new UmamiProvider('pid', {
      provider: 'umami',
      type: 'file',
      fileUrl,
      projectMapper: [],
    });

    for await (const _event of provider.parseSource()) {
      // parseSource must throw before yielding anything
    }
  };

  it('refuses a loopback fileUrl and never connects', async () => {
    hits = [];

    await expect(
      drain(`http://127.0.0.1:${internalPort}/secret.csv`),
    ).rejects.toThrow();

    expect(hits).toEqual([]);
  });

  it('refuses cloud instance metadata', async () => {
    await expect(
      drain('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow();
  });

  it('does not leak the upstream status or URL in the error', async () => {
    hits = [];
    const target = `http://127.0.0.1:${internalPort}/secret.csv`;

    const error = await drain(target).catch((err: unknown) => err as Error);

    expect(error).toBeInstanceOf(Error);
    // The old message was `Failed to fetch remote file: 418 I'm a Teapot`.
    expect(error.message).not.toContain('418');
    expect(error.message).not.toContain('Teapot');
    expect(error.message).not.toContain(target);
    expect(hits).toEqual([]);
  });
});
