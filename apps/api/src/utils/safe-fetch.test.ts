import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BlockedUrlError, isBlockedIp, safeFetch } from './safe-fetch';

describe('isBlockedIp', () => {
  it('blocks the ranges an SSRF payload aims at', () => {
    const blocked = [
      '169.254.169.254', // AWS/GCP/Azure instance metadata
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1', // CGNAT
      '198.18.0.1', // benchmarking
      '224.0.0.1', // multicast
      '255.255.255.255',
      '::1',
      '::',
      'fd00::1', // unique local
      'fe80::1', // link local
      'ff00::1', // multicast
      '::ffff:127.0.0.1', // IPv4-mapped loopback
      '::ffff:169.254.169.254', // IPv4-mapped metadata
      '2002:7f00:1::', // 6to4 wrapping 127.0.0.1
      '64:ff9b::7f00:1', // NAT64 wrapping 127.0.0.1
      'not-an-ip',
    ];

    for (const ip of blocked) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe('safeFetch', () => {
  let secretServer: http.Server;
  let redirectServer: http.Server;
  let secretPort: number;
  let redirectPort: number;

  beforeAll(async () => {
    secretServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('INTERNAL-SECRET');
    });
    await new Promise<void>((resolve) =>
      secretServer.listen(0, '127.0.0.1', resolve),
    );
    secretPort = (secretServer.address() as AddressInfo).port;

    redirectServer = http.createServer((_req, res) => {
      res.writeHead(302, {
        location: `http://127.0.0.1:${secretPort}/secret.png`,
      });
      res.end();
    });
    await new Promise<void>((resolve) =>
      redirectServer.listen(0, '127.0.0.1', resolve),
    );
    redirectPort = (redirectServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => secretServer.close(() => resolve()));
    await new Promise<void>((resolve) => redirectServer.close(() => resolve()));
  });

  it('refuses to fetch a loopback address directly', async () => {
    await expect(
      safeFetch(`http://127.0.0.1:${secretPort}/secret.png`, {
        timeoutMs: 3000,
      }),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('refuses to fetch a hostname that resolves to loopback', async () => {
    await expect(
      safeFetch(`http://localhost:${secretPort}/secret.png`, {
        timeoutMs: 3000,
      }),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('refuses a redirect that points at an internal address', async () => {
    // The reachability gate on the caller side only inspects the first URL,
    // so the redirect hop has to be re-validated or the guard is bypassable.
    await expect(
      safeFetch(`http://127.0.0.1:${redirectPort}/x.png`, { timeoutMs: 3000 }),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('refuses cloud instance metadata', async () => {
    await expect(
      safeFetch('http://169.254.169.254/latest/meta-data/', {
        timeoutMs: 3000,
      }),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('refuses non-http schemes', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });
});
