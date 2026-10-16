import { note } from '@clack/prompts';
import type { Install } from './doctor/types';
import { channelOf, isLoggedIn } from './supporter';
import { bold, cyan } from './ui';

export const SUPPORTER_URL = 'https://openpanel.dev/supporter';

// Perks as the supporter page states them; keep the two in sync.
const PERKS = [
  'The latest images, built on every commit: new features and fixes before public releases',
  'Priority support and a supporter role on Discord',
  'A direct hand in what OpenPanel builds next',
] as const;

interface BannerContext {
  install: Install | null;
  isTerminal: boolean;
  env: Record<string, string | undefined>;
  loggedIn: () => boolean;
}

// Only for people who see it and are not supporters already: never in CI,
// scripts or pipes, and never on an install that runs supporter images.
export const shouldShowSupportBanner = ({
  install,
  isTerminal,
  env,
  loggedIn,
}: BannerContext): boolean => {
  const optedOut = Boolean(env.OPENPANEL_NO_SUPPORT_BANNER || env.CI);
  if (optedOut || !isTerminal) {
    return false;
  }
  const isSupporter =
    (install !== null && channelOf(install) === 'supporter') || loggedIn();
  return !isSupporter;
};

export const supportBannerText = (): string =>
  [
    'OpenPanel is open source and self-hosting is free.',
    'Supporters keep it that way, and get:',
    '',
    ...PERKS.map((perk) => `  • ${perk}`),
    '',
    `${bold('Become a supporter:')} ${cyan(SUPPORTER_URL)}`,
  ].join('\n');

export const showSupportBanner = (install: Install | null): void => {
  const show = shouldShowSupportBanner({
    install,
    isTerminal: Boolean(process.stdout.isTTY),
    env: process.env,
    loggedIn: () => isLoggedIn(),
  });
  if (show) {
    note(supportBannerText(), 'Enjoying OpenPanel?');
  }
};
