import { useMemo } from 'react';
import { NOT_SET_VALUE } from '@/utils/constants';
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

const mapper: Record<string, LucideIcon> = {
  // Events
  screen_view: MonitorPlayIcon,
  session_start: ActivityIcon,
  session_end: ActivityIcon,
  link_out: ExternalLinkIcon,

  // Websites
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
