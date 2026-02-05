import type { LucideProps } from 'lucide-react';
import {
  ActivityIcon,
  BookIcon,
  CpuIcon,
  ExternalLinkIcon,
  HelpCircleIcon,
  MailIcon,
  MessageCircleIcon,
  MonitorIcon,
  MonitorPlayIcon,
  PodcastIcon,
  ScanIcon,
  SearchIcon,
  SmartphoneIcon,
  TabletIcon,
  TvIcon,
} from 'lucide-react';
import { useState } from 'react';

import { NOT_SET_VALUE } from '@openpanel/constants';

import { useAppContext } from '@/hooks/use-app-context';
import iconsWithUrls from './serie-icon.urls';

// ============================================================================
// Types
// ============================================================================

type SerieIconProps = Omit<LucideProps, 'name'> & {
  name?: string | string[];
};

type IconType = 'lucide' | 'image' | 'flag';

type ResolvedIcon =
  | { type: 'lucide'; Icon: React.ComponentType<LucideProps> }
  | { type: 'image'; url: string }
  | { type: 'flag'; code: string }
  | null;

// ============================================================================
// Constants
// ============================================================================

const LUCIDE_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  // Events
  screen_view: MonitorPlayIcon,
  session_start: ActivityIcon,
  session_end: ActivityIcon,
  link_out: ExternalLinkIcon,

  // Devices
  smarttv: TvIcon,
  mobile: SmartphoneIcon,
  desktop: MonitorIcon,
  tablet: TabletIcon,

  // Sources
  search: SearchIcon,
  social: PodcastIcon,
  email: MailIcon,
  podcast: PodcastIcon,
  comment: MessageCircleIcon,
  tech: CpuIcon,
  content: BookIcon,

  // Misc
  unknown: HelpCircleIcon,
  [NOT_SET_VALUE]: ScanIcon,
};

const FLAG_CODES = new Set([
  'ie',
  'tw',
  'py',
  'kr',
  'nz',
  'do',
  'cl',
  'dz',
  'np',
  'ma',
  'gh',
  'zm',
  'pa',
  'tn',
  'lk',
  'sv',
  've',
  'sn',
  'gt',
  'xk',
  'jm',
  'cm',
  'ni',
  'uy',
  'ss',
  'cd',
  'cu',
  'kh',
  'bb',
  'gf',
  'et',
  'pe',
  'mo',
  'mn',
  'hn',
  'cn',
  'ng',
  'se',
  'jp',
  'hk',
  'us',
  'gb',
  'ua',
  'ru',
  'de',
  'fr',
  'br',
  'in',
  'it',
  'es',
  'pl',
  'nl',
  'id',
  'tr',
  'ph',
  'ca',
  'ar',
  'mx',
  'za',
  'au',
  'co',
  'ch',
  'at',
  'be',
  'pt',
  'my',
  'th',
  'vn',
  'sg',
  'eg',
  'sa',
  'pk',
  'bd',
  'ro',
  'hu',
  'cz',
  'gr',
  'il',
  'no',
  'fi',
  'dk',
  'sk',
  'bg',
  'hr',
  'rs',
  'ba',
  'si',
  'lv',
  'lt',
  'ee',
  'by',
  'md',
  'kz',
  'uz',
  'kg',
  'tj',
  'tm',
  'az',
  'ge',
  'am',
  'af',
  'ir',
  'iq',
  'sy',
  'lb',
  'jo',
  'ps',
  'kw',
  'qa',
  'om',
  'ye',
  'ae',
  'bh',
  'cy',
  'mt',
  'sm',
  'li',
  'is',
  'al',
  'mk',
  'me',
  'ad',
  'lu',
  'mc',
  'fo',
  'gg',
  'je',
  'im',
  'gi',
  'va',
  'ax',
  'bl',
  'mf',
  'pm',
  'yt',
  'wf',
  'tf',
  're',
  'sc',
  'mu',
  'zw',
  'mz',
  'na',
  'bw',
  'ls',
  'sz',
  'bi',
  'rw',
  'ug',
  'ke',
  'tz',
  'mg',
  'cr',
  'ky',
  'gy',
  'mm',
  'la',
  'gl',
  'gp',
  'fj',
  'cv',
  'gn',
  'bj',
  'bo',
  'bq',
  'bs',
  'ly',
  'bn',
  'tt',
  'sr',
  'ec',
  'mv',
  'pr',
  'ci',
]);

function getProxyImageUrl(url: string): string {
  return `/misc/favicon?url=${encodeURIComponent(url)}`;
}

function resolveIcon(name: string): ResolvedIcon {
  const key = name.toLowerCase();

  const lucideIcon = LUCIDE_ICONS[key];
  if (lucideIcon) {
    return { type: 'lucide', Icon: lucideIcon };
  }

  const imageUrl = iconsWithUrls[key as keyof typeof iconsWithUrls];
  if (imageUrl) {
    return { type: 'image', url: getProxyImageUrl(imageUrl) };
  }

  if (FLAG_CODES.has(key)) {
    return { type: 'flag', code: key };
  }

  if (name.includes('http')) {
    return { type: 'image', url: getProxyImageUrl(name) };
  }

  if (name.match(/^.+\.\w{2,3}$/)) {
    return { type: 'image', url: getProxyImageUrl(`https://${name}`) };
  }

  return null;
}

function IconWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className={'relative max-h-4 flex-shrink-0 [&_svg]:!rounded-[2px]'}>
      {children}
    </div>
  );
}

function ImageIcon({ url }: { url: string }) {
  const context = useAppContext();
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null;
  }

  const fullUrl = context.apiUrl?.replace(/\/$/, '') + url;

  return (
    <IconWrapper>
      <img
        src={fullUrl}
        alt=""
        className="w-full max-h-4 rounded-[2px] object-contain"
        loading="lazy"
        decoding="async"
        onError={() => setHasError(true)}
      />
    </IconWrapper>
  );
}

function FlagIcon({ code }: { code: string }) {
  return (
    <IconWrapper>
      <span
        className={`fi !block aspect-[1.33] overflow-hidden rounded-[2px] fi-${code}`}
      />
    </IconWrapper>
  );
}

function LucideIconWrapper({
  Icon,
  ...props
}: { Icon: React.ComponentType<LucideProps> } & LucideProps) {
  return (
    <IconWrapper>
      <Icon size={16} {...props} />
    </IconWrapper>
  );
}

// Main component

export function SerieIcon({ name: names, ...props }: SerieIconProps) {
  const name = Array.isArray(names) ? names[0] : names;

  if (!name) {
    return null;
  }

  const resolved = resolveIcon(name);

  if (!resolved) {
    return null;
  }

  switch (resolved.type) {
    case 'lucide':
      return <LucideIconWrapper Icon={resolved.Icon} {...props} />;
    case 'image':
      return <ImageIcon url={resolved.url} />;
    case 'flag':
      return <FlagIcon code={resolved.code} />;
  }
}
