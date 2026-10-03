import { cancel, isCancel, select, text } from '@clack/prompts';
import type { Install } from './doctor/types';
import {
  type Channel,
  publicImage,
  SUPPORTER_REGISTRY,
  supporterImage,
} from './supporter';

// The worker runs the api image, so the two are one decision.
const IMAGE_GROUPS = [
  { app: 'api', services: ['op-api', 'op-worker'] },
  { app: 'dashboard', services: ['op-dashboard'] },
] as const;

// Images OpenPanel publishes; anything else is someone's own build or mirror.
const OFFICIAL_PREFIXES = ['lindesvard/openpanel-', `${SUPPORTER_REGISTRY}/`];

export interface ImageDecision {
  services: string[];
  current: string;
  proposed: string;
}

export const isOfficialImage = (image: string): boolean =>
  OFFICIAL_PREFIXES.some((prefix) => image.startsWith(prefix));

export const proposedImage = (
  channel: Channel,
  app: string,
  version: string
): string =>
  channel === 'supporter'
    ? supporterImage(app, version)
    : publicImage(app, version);

const imageOf = (install: Install, service: string): string =>
  String(install.compose.getIn(['services', service, 'image']) ?? '');

// One decision per image this upgrade would change.
export const imageDecisions = (
  install: Install,
  channel: Channel,
  version: string
): ImageDecision[] =>
  IMAGE_GROUPS.flatMap(({ app, services }) => {
    const present = services.filter((service) =>
      install.compose.hasIn(['services', service])
    );
    const [first] = present;
    if (!first) {
      return [];
    }
    const proposed = proposedImage(channel, app, version);
    const upToDate = present.every(
      (service) => imageOf(install, service) === proposed
    );
    return upToDate
      ? []
      : [{ services: present, current: imageOf(install, first), proposed }];
  });

// Without a person to ask (--yes): move OpenPanel's own images, keep any other.
export const defaultImage = (decision: ImageDecision): string =>
  isOfficialImage(decision.current) ? decision.proposed : decision.current;

const answer = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel('Cancelled. Nothing was changed.');
    process.exit(0);
  }
  return value as T;
};

const NO_WHITESPACE = /^\S+$/;

export const chooseImage = async (
  decision: ImageDecision,
  yes: boolean
): Promise<string> => {
  if (yes) {
    return defaultImage(decision);
  }
  const choice = answer(
    await select({
      message: `${decision.services.join(', ')} run ${decision.current}. This upgrade uses ${decision.proposed}.`,
      initialValue:
        defaultImage(decision) === decision.proposed ? 'new' : 'keep',
      options: [
        { value: 'new', label: `Use ${decision.proposed}` },
        { value: 'keep', label: `Keep ${decision.current}` },
        { value: 'custom', label: 'Use a different image…' },
      ],
    })
  );
  if (choice === 'new') {
    return decision.proposed;
  }
  if (choice === 'keep') {
    return decision.current;
  }
  return answer(
    await text({
      message: `Image for ${decision.services.join(', ')}`,
      initialValue: decision.current,
      validate: (value) =>
        value && NO_WHITESPACE.test(value)
          ? undefined
          : 'Enter an image reference, e.g. registry/name:tag',
    })
  );
};

// Returns a line per service that changed, for the confirmation list.
export const applyImage = (
  install: Install,
  decision: ImageDecision,
  image: string
): string[] =>
  decision.services.flatMap((service) => {
    const current = imageOf(install, service);
    if (current === image) {
      return [];
    }
    install.compose.setIn(['services', service, 'image'], image);
    return [`${service}: ${current} → ${image}`];
  });
