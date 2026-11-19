import { NOT_SET_VALUE } from '@openpanel/core/modules/report/report.constants';
import { getLogo, type Logo } from '@openpanel/logos';
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
import faviconDomains from './serie-icon.domains';
import { useTheme } from '@/components/theme-provider';
import { useAppContext } from '@/hooks/use-app-context';

// ============================================================================
// Types
// ============================================================================

type SerieIconProps = Omit<LucideProps, 'name' | 'fill'> & {
  name?: string | string[];
  /**
   * When true, render the icon at the size of its parent container instead
   * of the default max-h-4 cap. Use for circular/full-bleed contexts like
   * chart markers where the favicon should fill the surrounding circle.
   * Overrides Lucide's `fill` prop semantics for this component.
   */
  fill?: boolean;
};

// `logo` is a static file shipped with the dashboard; `favicon` goes through
// the api's proxy and needs the api origin prefixed at render time.
type ResolvedIcon =
  | { type: 'lucide'; Icon: React.ComponentType<LucideProps> }
  | { type: 'logo'; logo: Logo }
  | { type: 'favicon'; path: string }
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

function faviconPath(url: string): string {
  return `/misc/favicon?url=${encodeURIComponent(url)}`;
}

function resolveIcon(name: string): ResolvedIcon {
  const key = name.toLowerCase();

  const lucideIcon = LUCIDE_ICONS[key];
  if (lucideIcon) {
    return { type: 'lucide', Icon: lucideIcon };
  }

  const logo = getLogo(key);
  if (logo) {
    return { type: 'logo', logo };
  }

  const domainUrl = faviconDomains[key];
  if (domainUrl) {
    return { type: 'favicon', path: faviconPath(domainUrl) };
  }

  if (FLAG_CODES.has(key)) {
    return { type: 'flag', code: key };
  }

  if (name.includes('http')) {
    return { type: 'favicon', path: faviconPath(name) };
  }

  if (name.match(/^.+\.\w{2,3}$/)) {
    return { type: 'favicon', path: faviconPath(`https://${name}`) };
  }

  return null;
}

function IconWrapper({
  children,
  fill,
}: {
  children: React.ReactNode;
  fill?: boolean;
}) {
  return (
    <div
      className={
        fill
          ? '[&_svg]:!rounded-[2px] relative size-full flex-shrink-0'
          : '[&_svg]:!rounded-[2px] relative max-h-4 flex-shrink-0'
      }
    >
      {children}
    </div>
  );
}

function LogoIcon({ logo, fill }: { logo: Logo; fill?: boolean }) {
  const { theme } = useTheme();
  const src = theme === 'dark' ? (logo.dark ?? logo.light) : logo.light;
  return <ImageIcon fill={fill} src={src} />;
}

function FaviconIcon({ path, fill }: { path: string; fill?: boolean }) {
  const { apiUrl } = useAppContext();
  return <ImageIcon fill={fill} src={`${apiUrl?.replace(/\/$/, '')}${path}`} />;
}

function ImageIcon({ src, fill }: { src: string; fill?: boolean }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null;
  }

  return (
    <IconWrapper fill={fill}>
      <img
        alt=""
        className={
          fill
            ? 'size-full rounded-full object-cover'
            : 'max-h-4 w-full rounded-[2px] object-contain'
        }
        decoding="async"
        loading="lazy"
        onError={() => setHasError(true)}
        src={src}
      />
    </IconWrapper>
  );
}

function FlagIcon({ code, fill }: { code: string; fill?: boolean }) {
  return (
    <IconWrapper fill={fill}>
      <span
        className={
          fill
            ? `fi !block size-full overflow-hidden rounded-full fi-${code}`
            : `fi !block aspect-[1.33] overflow-hidden rounded-[2px] fi-${code}`
        }
      />
    </IconWrapper>
  );
}

function LucideIconWrapper({
  Icon,
  fill,
  ...props
}: {
  Icon: React.ComponentType<LucideProps>;
  fill?: boolean;
} & Omit<LucideProps, 'fill'>) {
  return (
    <IconWrapper fill={fill}>
      <Icon size={fill ? undefined : 16} {...props} />
    </IconWrapper>
  );
}

// Main component

export function SerieIcon({ name: names, fill, ...props }: SerieIconProps) {
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
      return <LucideIconWrapper fill={fill} Icon={resolved.Icon} {...props} />;
    case 'logo':
      return <LogoIcon fill={fill} logo={resolved.logo} />;
    case 'favicon':
      return <FaviconIcon fill={fill} path={resolved.path} />;
    case 'flag':
      return <FlagIcon code={resolved.code} fill={fill} />;
  }
}
