import { useMemo } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ActivityIcon,
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

import { NOT_SET_VALUE } from '@openpanel/constants';

import flags from './SerieIcon.flags';
import iconsWithUrls from './SerieIcon.urls';

type SerieIconProps = Omit<LucideProps, 'name'> & {
  name?: string | string[];
};

function getProxyImage(url: string) {
  return `${String(process.env.NEXT_PUBLIC_API_URL)}/misc/favicon?url=${encodeURIComponent(url)}`;
}

const createImageIcon = (url: string) => {
  return function (_props: LucideProps) {
    return <img className="max-h-4 rounded-[2px] object-contain" src={url} />;
  } as LucideIcon;
};

const mapper: Record<string, LucideIcon> = {
  // Events
  screen_view: MonitorPlayIcon,
  session_start: ActivityIcon,
  session_end: ActivityIcon,
  link_out: ExternalLinkIcon,

  // Misc
  smarttv: TvIcon,
  mobile: SmartphoneIcon,
  desktop: MonitorIcon,
  tablet: TabletIcon,
  search: SearchIcon,
  social: PodcastIcon,
  email: MailIcon,
  podcast: PodcastIcon,
  comment: MessageCircleIcon,
  unknown: HelpCircleIcon,
  [NOT_SET_VALUE]: ScanIcon,

  ...Object.entries(iconsWithUrls).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: createImageIcon(getProxyImage(value)),
    }),
    {}
  ),

  ...flags,
};

export function SerieIcon({ name: names, ...props }: SerieIconProps) {
  const name = Array.isArray(names) ? names[0] : names;
  const Icon = useMemo(() => {
    if (!name) {
      return null;
    }

    const mapped = mapper[name.toLowerCase()] ?? null;

    if (mapped) {
      return mapped;
    }

    if (name.includes('http')) {
      return createImageIcon(getProxyImage(name));
    }

    // Matching image file name
    if (name.match(/(.+)\.\w{2,3}$/)) {
      return createImageIcon(getProxyImage(`https://${name}`));
    }

    return null;
  }, [name]);

  return Icon ? (
    <div className="relative max-h-4 flex-shrink-0 [&_svg]:!rounded-[2px]">
      <Icon size={16} {...props} name={name} />
    </div>
  ) : null;
}
