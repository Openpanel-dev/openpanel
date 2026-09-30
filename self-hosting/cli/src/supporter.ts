import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Install } from './doctor/types';
import { type Fetcher, isNewer } from './self-update';
import { STACK_IMAGE_TAG } from './templates';

// Supporters pull every internal build (each push to main) from this registry,
// which mirrors ghcr.io/openpanel-dev; the public release images are on Docker Hub.
export const SUPPORTER_REGISTRY = 'docker.openpanel.dev';
const SUPPORTER_NAMESPACE = `${SUPPORTER_REGISTRY}/openpanel-dev`;
const PUBLIC_NAMESPACE = 'lindesvard/openpanel-';
const TAGS_API =
  process.env.OPENPANEL_TAGS_API ??
  'https://api.github.com/repos/Openpanel-dev/openpanel/tags?per_page=100';
const VERSION_TAG = /^v(\d+\.\d+\.\d+)$/;

// The worker runs the api image, so it follows the api's repository.
const SERVICE_APP = {
  'op-api': 'api',
  'op-worker': 'api',
  'op-dashboard': 'dashboard',
} as const;

export type Channel = 'public' | 'supporter';

export const supporterImage = (app: string, version: string) =>
  `${SUPPORTER_NAMESPACE}/${app}:${version}`;
export const publicImage = (app: string, version: string) =>
  `${PUBLIC_NAMESPACE}${app}:${version}`;

export const channelOf = (install: Install): Channel => {
  const image = install.compose.getIn(['services', 'op-api', 'image']);
  return typeof image === 'string' && image.startsWith(`${SUPPORTER_REGISTRY}/`)
    ? 'supporter'
    : 'public';
};

// Points every OpenPanel service at the channel's images; returns what changed.
export const pointAt = (
  install: Install,
  channel: Channel,
  version: string
): string[] => {
  const changes: string[] = [];
  for (const [service, app] of Object.entries(SERVICE_APP)) {
    if (!install.compose.hasIn(['services', service])) {
      continue;
    }
    const current = String(
      install.compose.getIn(['services', service, 'image']) ?? ''
    );
    const next =
      channel === 'supporter'
        ? supporterImage(app, version)
        : publicImage(app, version);
    if (current !== next) {
      install.compose.setIn(['services', service, 'image'], next);
      changes.push(`${service}: ${current} → ${next}`);
    }
  }
  return changes;
};

export const publicVersion = (): string => STACK_IMAGE_TAG;

// Every push to main is tagged vX.Y.Z; the highest one is the newest build.
export const latestBuildVersion = async (fetcher: Fetcher): Promise<string> => {
  const response = await fetcher(TAGS_API);
  if (!response.ok) {
    throw new Error(`Could not list versions (HTTP ${response.status})`);
  }
  const tags = (await response.json()) as { name: string }[];
  const versions = tags.flatMap(
    ({ name }) => VERSION_TAG.exec(name)?.[1] ?? []
  );
  const latest = versions.reduce<string | null>(
    (highest, version) =>
      highest === null || isNewer(version, highest) ? version : highest,
    null
  );
  if (!latest) {
    throw new Error('No versioned builds found');
  }
  return latest;
};

interface DockerConfig {
  auths?: Record<string, unknown>;
  credHelpers?: Record<string, unknown>;
}

// `docker login` records the registry in config.json (under auths, or
// credHelpers with a credential helper), whichever store holds the secret.
export const isLoggedIn = (
  registry: string = SUPPORTER_REGISTRY,
  configDir: string = process.env.DOCKER_CONFIG ?? join(homedir(), '.docker')
): boolean => {
  try {
    const config = JSON.parse(
      readFileSync(join(configDir, 'config.json'), 'utf8')
    ) as DockerConfig;
    const keys = [
      ...Object.keys(config.auths ?? {}),
      ...Object.keys(config.credHelpers ?? {}),
    ];
    return keys.some(
      (key) => key.replace(/^https?:\/\//, '').replace(/\/.*$/, '') === registry
    );
  } catch {
    return false;
  }
};

export const LOGIN_HINT = `Log in with your supporter key first:\n  echo "<your key>" | docker login ${SUPPORTER_REGISTRY} -u user --password-stdin\nBecome a supporter at https://openpanel.dev/supporter`;
