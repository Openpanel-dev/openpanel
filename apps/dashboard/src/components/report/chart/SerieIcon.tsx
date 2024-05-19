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
} from 'lucide-react';

import { NOT_SET_VALUE } from '@openpanel/constants';

import flags from './SerieIcon.flags';
import iconsWithUrls from './SerieIcon.urls';

interface SerieIconProps extends LucideProps {
  name?: string;
}

function getProxyImage(url: string) {
  return `${String(process.env.NEXT_PUBLIC_API_URL)}/misc/favicon?url=${encodeURIComponent(url)}`;
}

const createImageIcon = (url: string) => {
  return function (_props: LucideProps) {
    return <img className="h-4 rounded-[2px] object-contain" src={url} />;
  } as LucideIcon;
};

const mapper: Record<string, LucideIcon> = {
  // Events
  screen_view: MonitorPlayIcon,
  session_start: ActivityIcon,
  session_end: ActivityIcon,
  link_out: ExternalLinkIcon,

  // Misc
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

export function SerieIcon({ name, ...props }: SerieIconProps) {
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

    if (name.match(/(.+)\.\w{2,3}$/)) {
      return createImageIcon(getProxyImage(`https://${name}`));
    }

    return null;
  }, [name]);

  return Icon ? (
    <div className="[&_a]:![&_a]:!h-4 relative h-4 flex-shrink-0 [&_svg]:!rounded-[2px]">
      <Icon size={16} {...props} />
    </div>
  ) : null;
}
