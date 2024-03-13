import { useMemo } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ActivityIcon,
  ExternalLinkIcon,
  HelpCircleIcon,
  MailIcon,
  MonitorIcon,
  MonitorPlayIcon,
  PodcastIcon,
  ScanIcon,
  SearchIcon,
  SmartphoneIcon,
  TabletIcon,
} from 'lucide-react';

import { NOT_SET_VALUE } from '@openpanel/constants';

interface SerieIconProps extends LucideProps {
  name: string;
}

function getProxyImage(url: string) {
  return `${String(process.env.NEXT_PUBLIC_API_URL)}/misc/favicon?url=${encodeURIComponent(url)}`;
}

const createImageIcon = (url: string) => {
  return function (props: LucideProps) {
    return <img className="w-4 h-4 object-cover rounded" src={url} />;
  } as LucideIcon;
};

const createFlagIcon = (url: string) => {
  return function (props: LucideProps) {
    return (
      <span className={`rounded !block !leading-[1rem] fi fi-${url}`}></span>
    );
  } as LucideIcon;
};

const mapper: Record<string, LucideIcon> = {
  // Events
  screen_view: MonitorPlayIcon,
  session_start: ActivityIcon,
  session_end: ActivityIcon,
  link_out: ExternalLinkIcon,

  // Websites
  linkedin: createImageIcon(getProxyImage('https://linkedin.com')),
  slack: createImageIcon(getProxyImage('https://slack.com')),
  pinterest: createImageIcon(getProxyImage('https://www.pinterest.se')),
  ecosia: createImageIcon(getProxyImage('https://ecosia.com')),
  yandex: createImageIcon(getProxyImage('https://yandex.com')),
  google: createImageIcon(getProxyImage('https://google.com')),
  facebook: createImageIcon(getProxyImage('https://facebook.com')),
  bing: createImageIcon(getProxyImage('https://bing.com')),
  twitter: createImageIcon(getProxyImage('https://x.com')),
  duckduckgo: createImageIcon(getProxyImage('https://duckduckgo.com')),
  'yahoo!': createImageIcon(getProxyImage('https://yahoo.com')),
  instagram: createImageIcon(getProxyImage('https://instagram.com')),
  gmail: createImageIcon(getProxyImage('https://mail.google.com/')),

  'mobile safari': createImageIcon(
    getProxyImage(
      'https://upload.wikimedia.org/wikipedia/commons/5/52/Safari_browser_logo.svg'
    )
  ),
  chrome: createImageIcon(
    getProxyImage(
      'https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Chrome_icon_%28February_2022%29.svg'
    )
  ),
  'samsung internet': createImageIcon(
    getProxyImage(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Samsung_Internet_logo.svg/1024px-Samsung_Internet_logo.svg.png'
    )
  ),
  safari: createImageIcon(
    getProxyImage(
      'https://upload.wikimedia.org/wikipedia/commons/5/52/Safari_browser_logo.svg'
    )
  ),
  edge: createImageIcon(
    getProxyImage(
      'https://upload.wikimedia.org/wikipedia/commons/7/7e/Microsoft_Edge_logo_%282019%29.png'
    )
  ),
  firefox: createImageIcon(
    getProxyImage(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Firefox_logo%2C_2019.svg/1920px-Firefox_logo%2C_2019.svg.png'
    )
  ),
  snapchat: createImageIcon(getProxyImage('https://snapchat.com')),

  // Misc
  mobile: SmartphoneIcon,
  desktop: MonitorIcon,
  tablet: TabletIcon,
  search: SearchIcon,
  social: PodcastIcon,
  email: MailIcon,
  unknown: HelpCircleIcon,
  [NOT_SET_VALUE]: ScanIcon,

  // Flags
  se: createFlagIcon('se'),
  us: createFlagIcon('us'),
  gb: createFlagIcon('gb'),
  ua: createFlagIcon('ua'),
  ru: createFlagIcon('ru'),
  de: createFlagIcon('de'),
  fr: createFlagIcon('fr'),
  br: createFlagIcon('br'),
  in: createFlagIcon('in'),
  it: createFlagIcon('it'),
  es: createFlagIcon('es'),
  pl: createFlagIcon('pl'),
  nl: createFlagIcon('nl'),
  id: createFlagIcon('id'),
  tr: createFlagIcon('tr'),
  ph: createFlagIcon('ph'),
  ca: createFlagIcon('ca'),
  ar: createFlagIcon('ar'),
  mx: createFlagIcon('mx'),
  za: createFlagIcon('za'),
  au: createFlagIcon('au'),
  co: createFlagIcon('co'),
  ch: createFlagIcon('ch'),
  at: createFlagIcon('at'),
  be: createFlagIcon('be'),
  pt: createFlagIcon('pt'),
  my: createFlagIcon('my'),
  th: createFlagIcon('th'),
  vn: createFlagIcon('vn'),
  sg: createFlagIcon('sg'),
  eg: createFlagIcon('eg'),
  sa: createFlagIcon('sa'),
  pk: createFlagIcon('pk'),
  bd: createFlagIcon('bd'),
  ro: createFlagIcon('ro'),
  hu: createFlagIcon('hu'),
  cz: createFlagIcon('cz'),
  gr: createFlagIcon('gr'),
  il: createFlagIcon('il'),
  no: createFlagIcon('no'),
  fi: createFlagIcon('fi'),
  dk: createFlagIcon('dk'),
  sk: createFlagIcon('sk'),
  bg: createFlagIcon('bg'),
  hr: createFlagIcon('hr'),
  rs: createFlagIcon('rs'),
  ba: createFlagIcon('ba'),
  si: createFlagIcon('si'),
  lv: createFlagIcon('lv'),
  lt: createFlagIcon('lt'),
  ee: createFlagIcon('ee'),
  by: createFlagIcon('by'),
  md: createFlagIcon('md'),
  kz: createFlagIcon('kz'),
  uz: createFlagIcon('uz'),
  kg: createFlagIcon('kg'),
  tj: createFlagIcon('tj'),
  tm: createFlagIcon('tm'),
  az: createFlagIcon('az'),
  ge: createFlagIcon('ge'),
  am: createFlagIcon('am'),
  af: createFlagIcon('af'),
  ir: createFlagIcon('ir'),
  iq: createFlagIcon('iq'),
  sy: createFlagIcon('sy'),
  lb: createFlagIcon('lb'),
  jo: createFlagIcon('jo'),
  ps: createFlagIcon('ps'),
  kw: createFlagIcon('kw'),
  qa: createFlagIcon('qa'),
  om: createFlagIcon('om'),
  ye: createFlagIcon('ye'),
  ae: createFlagIcon('ae'),
  bh: createFlagIcon('bh'),
  cy: createFlagIcon('cy'),
  mt: createFlagIcon('mt'),
  sm: createFlagIcon('sm'),
  li: createFlagIcon('li'),
  is: createFlagIcon('is'),
  al: createFlagIcon('al'),
  mk: createFlagIcon('mk'),
  me: createFlagIcon('me'),
  ad: createFlagIcon('ad'),
  lu: createFlagIcon('lu'),
  mc: createFlagIcon('mc'),
  fo: createFlagIcon('fo'),
  gg: createFlagIcon('gg'),
  je: createFlagIcon('je'),
  im: createFlagIcon('im'),
  gi: createFlagIcon('gi'),
  va: createFlagIcon('va'),
  ax: createFlagIcon('ax'),
  bl: createFlagIcon('bl'),
  mf: createFlagIcon('mf'),
  pm: createFlagIcon('pm'),
  yt: createFlagIcon('yt'),
  wf: createFlagIcon('wf'),
  tf: createFlagIcon('tf'),
  re: createFlagIcon('re'),
  sc: createFlagIcon('sc'),
  mu: createFlagIcon('mu'),
  zw: createFlagIcon('zw'),
  mz: createFlagIcon('mz'),
  na: createFlagIcon('na'),
  bw: createFlagIcon('bw'),
  ls: createFlagIcon('ls'),
  sz: createFlagIcon('sz'),
  bi: createFlagIcon('bi'),
  rw: createFlagIcon('rw'),
  ug: createFlagIcon('ug'),
  ke: createFlagIcon('ke'),
  tz: createFlagIcon('tz'),
  mg: createFlagIcon('mg'),
};

export function SerieIcon({ name, ...props }: SerieIconProps) {
  const Icon = useMemo(() => {
    const mapped = mapper[name.toLowerCase()] ?? null;

    if (mapped) {
      return mapped;
    }

    if (name.includes('http')) {
      return createImageIcon(getProxyImage(name));
    }

    return null;
  }, [name]);

  return Icon ? (
    <div className="w-4 h-4 flex-shrink-0 relative [&_a]:!w-4 [&_a]:!h-4 [&_svg]:!rounded">
      <Icon size={16} {...props} />
    </div>
  ) : null;
}
