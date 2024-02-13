import { NOT_SET_VALUE } from '@/utils/constants';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ActivityIcon,
  ExternalLinkIcon,
  HelpCircleIcon,
  MonitorIcon,
  MonitorPlayIcon,
  PhoneIcon,
  SmartphoneIcon,
  SquareAsteriskIcon,
  TabletIcon,
  TabletSmartphoneIcon,
  TwitterIcon,
} from 'lucide-react';
import {
  getKeys,
  getNetworks,
  networkFor,
  register,
  SocialIcon,
} from 'react-social-icons';

interface SerieIconProps extends LucideProps {
  name: string;
}

const mapper: Record<string, LucideIcon> = {
  screen_view: MonitorPlayIcon,
  session_start: ActivityIcon,
  link_out: ExternalLinkIcon,
  mobile: SmartphoneIcon,
  desktop: MonitorIcon,
  tablet: TabletIcon,
  [NOT_SET_VALUE]: HelpCircleIcon,
};

const networks = getNetworks();

register('duckduckgo', {
  color: 'red',
  path: 'https://duckduckgo.com/favicon.ico',
});

export function SerieIcon({ name, ...props }: SerieIconProps) {
  let Icon = mapper[name] ?? null;

  if (name.includes('http')) {
    Icon = ((_props) => (
      <img
        className="w-4 h-4 object-cover"
        src={`${String(process.env.NEXT_PUBLIC_API_URL)}/misc/favicon?url=${encodeURIComponent(name)}`}
      />
    )) as LucideIcon;
  }

  if (Icon === null && networks.includes(name.toLowerCase())) {
    Icon = ((_props) => (
      <SocialIcon network={name.toLowerCase()} />
    )) as LucideIcon;
  }

  return (
    <div className="w-4 h-4 flex-shrink-0 relative [&_a]:!w-4 [&_a]:!h-4 [&_svg]:!rounded">
      {Icon ? <Icon size={16} {...props} /> : null}
    </div>
  );
}
