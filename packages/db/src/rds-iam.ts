import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import { Signer } from '@aws-sdk/rds-signer';
import type { PoolConfig } from 'pg';

// DATABASE_AUTH=rds-iam: authenticate to Amazon RDS / Aurora PostgreSQL with
// short-lived IAM auth tokens instead of the password in DATABASE_URL. Tokens
// expire after 15 minutes but are only checked at login, so the pool mints a
// fresh one for every new connection.
export const RDS_IAM_AUTH = 'rds-iam';

type Env = Record<string, string | undefined>;

export interface TokenRequest {
  hostname: string;
  port: number;
  username: string;
  region: string;
}

export type TokenSigner = (request: TokenRequest) => Promise<string>;

export interface RdsIamConnection {
  poolConfig: PoolConfig;
  schema?: string;
}

const RDS_HOSTNAME_REGION =
  /\.([a-z]{2}(?:-[a-z]+)+-\d+)\.rds\.amazonaws\.com(?:\.cn)?$/;

// The token is a bearer credential, so only modes that always encrypt.
const IAM_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);
const DEFAULT_SSL_MODE = 'verify-full';

export function isRdsIamAuth(env: Env = process.env): boolean {
  const auth = env.DATABASE_AUTH?.trim();
  if (!auth || auth === 'password') {
    return false;
  }
  if (auth === RDS_IAM_AUTH) {
    return true;
  }
  throw new Error(
    `Unknown DATABASE_AUTH "${auth}": expected "password" or "${RDS_IAM_AUTH}"`
  );
}

export function resolveRegion(hostname: string, env: Env): string {
  const configured = env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim();
  if (configured) {
    return configured;
  }
  const match = RDS_HOSTNAME_REGION.exec(hostname.toLowerCase());
  if (match?.[1]) {
    return match[1];
  }
  throw new Error(
    `Cannot determine the AWS region for ${hostname}: set AWS_REGION`
  );
}

function encryptedSslMode(url: URL): string {
  const mode = url.searchParams.get('sslmode') ?? DEFAULT_SSL_MODE;
  if (!IAM_SSL_MODES.has(mode)) {
    throw new Error(
      `DATABASE_AUTH=${RDS_IAM_AUTH} needs sslmode require, verify-ca or verify-full (got "${mode}")`
    );
  }
  return mode;
}

function sslConfig(url: URL): PoolConfig['ssl'] {
  const mode = encryptedSslMode(url);
  if (mode === 'require') {
    return { rejectUnauthorized: false };
  }
  // Node's TLS rejects keys that are present but undefined, so only set the
  // ones in use.
  const ssl: ConnectionOptions = { rejectUnauthorized: true };
  const rootCert = url.searchParams.get('sslrootcert');
  if (rootCert) {
    ssl.ca = readFileSync(rootCert, 'utf8');
  }
  // verify-ca checks the chain but not the hostname.
  if (mode === 'verify-ca') {
    ssl.checkServerIdentity = () => undefined;
  }
  return ssl;
}

export function signWithAwsSdk(request: TokenRequest): Promise<string> {
  return new Signer(request).getAuthToken();
}

function parseDatabaseUrl(databaseUrl: string | undefined): URL {
  if (!databaseUrl) {
    throw new Error(`DATABASE_AUTH=${RDS_IAM_AUTH} needs DATABASE_URL`);
  }
  const url = new URL(databaseUrl);
  if (!url.username) {
    throw new Error(
      `DATABASE_AUTH=${RDS_IAM_AUTH} needs the database user in DATABASE_URL`
    );
  }
  return url;
}

export function getRdsIamConnection(
  databaseUrl: string | undefined,
  env: Env = process.env,
  sign: TokenSigner = signWithAwsSdk
): RdsIamConnection {
  const url = parseDatabaseUrl(databaseUrl);
  const hostname = url.hostname;
  const port = Number(url.port || 5432);
  const username = decodeURIComponent(url.username);
  const region = resolveRegion(hostname, env);
  const connectionLimit = url.searchParams.get('connection_limit');

  return {
    poolConfig: {
      host: hostname,
      port,
      user: username,
      database: decodeURIComponent(url.pathname.slice(1)),
      password: () => sign({ hostname, port, username, region }),
      ssl: sslConfig(url),
      max: connectionLimit ? Number(connectionLimit) : undefined,
    },
    schema: url.searchParams.get('schema') ?? undefined,
  };
}

// For tools that only take a URL (prisma migrate deploy): the same URL with a
// fresh token as the password. Valid for new connections for 15 minutes.
export async function getRdsIamDatabaseUrl(
  databaseUrl: string | undefined,
  env: Env = process.env,
  sign: TokenSigner = signWithAwsSdk
): Promise<string> {
  const url = parseDatabaseUrl(databaseUrl);
  const mode = encryptedSslMode(url);
  const port = Number(url.port || 5432);
  const token = await sign({
    hostname: url.hostname,
    port,
    username: decodeURIComponent(url.username),
    region: resolveRegion(url.hostname, env),
  });
  url.password = encodeURIComponent(token);
  toPrismaEngineSsl(url, mode);
  return url.toString();
}

// Prisma's own engine has no verify-ca/verify-full: it verifies with
// sslmode=require&sslaccept=strict and takes the root CA as sslcert.
function toPrismaEngineSsl(url: URL, mode: string): void {
  if (mode === 'require') {
    return;
  }
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  const rootCert = url.searchParams.get('sslrootcert');
  if (rootCert) {
    url.searchParams.set('sslcert', rootCert);
    url.searchParams.delete('sslrootcert');
  }
}
