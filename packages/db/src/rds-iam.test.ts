import { describe, expect, it } from 'bun:test';
import type { ConnectionOptions } from 'node:tls';
import {
  getRdsIamConnection,
  getRdsIamDatabaseUrl,
  isRdsIamAuth,
  resolveRegion,
  type TokenRequest,
} from './rds-iam';

const AURORA_URL =
  'postgresql://op_runtime@db.cluster-abc.us-east-1.rds.amazonaws.com:5432/openpanel?schema=public&sslmode=require&connection_limit=7';

function recordingSigner() {
  const requests: TokenRequest[] = [];
  let issued = 0;
  const sign = (request: TokenRequest) => {
    requests.push(request);
    issued += 1;
    return Promise.resolve(`token/${issued}+=`);
  };
  return { requests, sign };
}

describe('isRdsIamAuth', () => {
  it('is off by default and for password auth', () => {
    expect(isRdsIamAuth({})).toBe(false);
    expect(isRdsIamAuth({ DATABASE_AUTH: 'password' })).toBe(false);
  });

  it('is on for rds-iam', () => {
    expect(isRdsIamAuth({ DATABASE_AUTH: 'rds-iam' })).toBe(true);
  });

  it('rejects unknown values instead of silently using the password', () => {
    expect(() => isRdsIamAuth({ DATABASE_AUTH: 'iam' })).toThrow(
      'Unknown DATABASE_AUTH'
    );
  });
});

describe('resolveRegion', () => {
  it('prefers AWS_REGION', () => {
    expect(
      resolveRegion('db.cluster-abc.us-east-1.rds.amazonaws.com', {
        AWS_REGION: 'eu-west-1',
      })
    ).toBe('eu-west-1');
  });

  it('reads the region from an RDS hostname', () => {
    expect(
      resolveRegion('db.cluster-ro-abc.ap-southeast-2.rds.amazonaws.com', {})
    ).toBe('ap-southeast-2');
    expect(resolveRegion('db.abc.us-gov-west-1.rds.amazonaws.com', {})).toBe(
      'us-gov-west-1'
    );
  });

  it('fails when the region cannot be determined', () => {
    expect(() => resolveRegion('10.0.0.5', {})).toThrow('set AWS_REGION');
  });
});

describe('getRdsIamConnection', () => {
  it('mints a token for every new connection', async () => {
    const { requests, sign } = recordingSigner();
    const { poolConfig, schema } = getRdsIamConnection(AURORA_URL, {}, sign);
    const password = poolConfig.password as () => Promise<string>;

    expect(await password()).toBe('token/1+=');
    expect(await password()).toBe('token/2+=');
    expect(requests).toEqual([
      {
        hostname: 'db.cluster-abc.us-east-1.rds.amazonaws.com',
        port: 5432,
        username: 'op_runtime',
        region: 'us-east-1',
      },
      {
        hostname: 'db.cluster-abc.us-east-1.rds.amazonaws.com',
        port: 5432,
        username: 'op_runtime',
        region: 'us-east-1',
      },
    ]);
    expect(schema).toBe('public');
  });

  it('maps the connection settings from DATABASE_URL', () => {
    const { sign } = recordingSigner();
    const { poolConfig } = getRdsIamConnection(AURORA_URL, {}, sign);

    expect(poolConfig.host).toBe('db.cluster-abc.us-east-1.rds.amazonaws.com');
    expect(poolConfig.port).toBe(5432);
    expect(poolConfig.user).toBe('op_runtime');
    expect(poolConfig.database).toBe('openpanel');
    expect(poolConfig.max).toBe(7);
    expect(poolConfig.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('verifies the server certificate by default', () => {
    const { sign } = recordingSigner();
    const url =
      'postgresql://op_runtime@db.cluster-abc.us-east-1.rds.amazonaws.com/openpanel';
    const { poolConfig } = getRdsIamConnection(url, {}, sign);

    expect(poolConfig.port).toBe(5432);
    expect(poolConfig.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('skips only the hostname check for verify-ca', () => {
    const { sign } = recordingSigner();
    const url =
      'postgresql://op_runtime@db.cluster-abc.us-east-1.rds.amazonaws.com/openpanel?sslmode=verify-ca';
    const { poolConfig } = getRdsIamConnection(url, {}, sign);
    const ssl = poolConfig.ssl as ConnectionOptions;

    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity?.('db.example.com', {} as never)).toBe(
      undefined
    );
  });

  it('refuses ssl modes that may send the token in plaintext', () => {
    const { sign } = recordingSigner();
    for (const mode of ['disable', 'allow', 'prefer']) {
      const url = `postgresql://op_runtime@db.cluster-abc.us-east-1.rds.amazonaws.com/openpanel?sslmode=${mode}`;
      expect(() => getRdsIamConnection(url, {}, sign)).toThrow('sslmode');
    }
  });

  it('needs a database user', () => {
    const { sign } = recordingSigner();
    expect(() =>
      getRdsIamConnection(
        'postgresql://db.cluster-abc.us-east-1.rds.amazonaws.com/openpanel',
        {},
        sign
      )
    ).toThrow('database user');
    expect(() => getRdsIamConnection(undefined, {}, sign)).toThrow(
      'DATABASE_URL'
    );
  });
});

describe('getRdsIamDatabaseUrl', () => {
  it('puts a URL-encoded token in place of the password', async () => {
    const { sign } = recordingSigner();
    const url = new URL(await getRdsIamDatabaseUrl(AURORA_URL, {}, sign));

    expect(decodeURIComponent(url.password)).toBe('token/1+=');
    expect(url.username).toBe('op_runtime');
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('translates verify-full into the Prisma engine ssl parameters', async () => {
    const { sign } = recordingSigner();
    const verifyFull =
      'postgresql://op_migrate@db.cluster-abc.us-east-1.rds.amazonaws.com/openpanel?sslmode=verify-full&sslrootcert=/certs/global-bundle.pem';
    const url = new URL(await getRdsIamDatabaseUrl(verifyFull, {}, sign));

    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('sslaccept')).toBe('strict');
    expect(url.searchParams.get('sslcert')).toBe('/certs/global-bundle.pem');
    expect(url.searchParams.has('sslrootcert')).toBe(false);
  });

  it('refuses to mint a token for a possibly plaintext connection', async () => {
    const { requests, sign } = recordingSigner();
    const prefer =
      'postgresql://op_migrate@db.cluster-abc.us-east-1.rds.amazonaws.com/openpanel?sslmode=prefer';

    await expect(getRdsIamDatabaseUrl(prefer, {}, sign)).rejects.toThrow(
      'sslmode'
    );
    expect(requests).toEqual([]);
  });
});
