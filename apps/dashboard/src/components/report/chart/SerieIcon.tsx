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
    return <img className="h-4 object-contain rounded-[2px]" src={url} />;
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

    return null;
  }, [name]);

  return Icon ? (
    <div className="h-4 flex-shrink-0 relative [&_a]:![&_a]:!h-4 [&_svg]:!rounded-[2px]">
      <Icon size={16} {...props} />
    </div>
  ) : null;
}
