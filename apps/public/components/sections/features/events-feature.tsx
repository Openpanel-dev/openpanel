'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  BellIcon,
  BookOpenIcon,
  DownloadIcon,
  EyeIcon,
  HeartIcon,
  LogOutIcon,
  MessageSquareIcon,
  SearchIcon,
  SettingsIcon,
  Share2Icon,
  ShoppingCartIcon,
  StarIcon,
  ThumbsUpIcon,
  UserPlusIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface Event {
  id: number;
  action: string;
  location: string;
  platform: string;
  icon: any;
  color: string;
}

const locations = [
  'Gothenburg',
  'Stockholm',
  'Oslo',
  'Copenhagen',
  'Berlin',
  'New York',
  'Singapore',
  'London',
  'Paris',
  'Madrid',
  'Rome',
  'Barcelona',
  'Amsterdam',
  'Vienna',
];
const platforms = ['iOS', 'Android', 'Windows', 'macOS'];
const browsers = ['WebKit', 'Chrome', 'Firefox', 'Safari'];

const getCountryFlag = (country: (typeof locations)[number]) => {
  switch (country) {
    case 'Gothenburg':
      return '🇸🇪';
    case 'Stockholm':
      return '🇸🇪';
    case 'Oslo':
      return '🇳🇴';
    case 'Copenhagen':
      return '🇩🇰';
    case 'Berlin':
      return '🇩🇪';
    case 'New York':
      return '🇺🇸';
    case 'Singapore':
      return '🇸🇬';
    case 'London':
      return '🇬🇧';
    case 'Paris':
      return '🇫🇷';
    case 'Madrid':
      return '🇪🇸';
    case 'Rome':
      return '🇮🇹';
    case 'Barcelona':
      return '🇪🇸';
    case 'Amsterdam':
      return '🇳🇱';
    case 'Vienna':
      return '🇦🇹';
  }
};

const getPlatformIcon = (platform: (typeof platforms)[number]) => {
  switch (platform) {
    case 'iOS':
      return '🍎';
    case 'Android':
      return '🤖';
    case 'Windows':
      return '💻';
    case 'macOS':
      return '🍎';
  }
};

const TOTAL_EVENTS = 10;

export function EventsFeature() {
  const [events, setEvents] = useState<Event[]>([
    {
      id: 1730663803358.4075,
      action: 'purchase',
      location: 'New York',
      platform: 'macOS',
      icon: ShoppingCartIcon,
      color: 'bg-blue-500',
    },
    {
      id: 1730663801358.3079,
      action: 'logout',
      location: 'Copenhagen',
      platform: 'Windows',
      icon: LogOutIcon,
      color: 'bg-red-500',
    },
    {
      id: 1730663799358.0283,
      action: 'sign up',
      location: 'Berlin',
      platform: 'Android',
      icon: UserPlusIcon,
      color: 'bg-green-500',
    },
    {
      id: 1730663797357.2036,
      action: 'share',
      location: 'Barcelona',
      platform: 'macOS',
      icon: Share2Icon,
      color: 'bg-cyan-500',
    },
    {
      id: 1730663795358.763,
      action: 'sign up',
      location: 'New York',
      platform: 'macOS',
      icon: UserPlusIcon,
      color: 'bg-green-500',
    },
    {
      id: 1730663792067.689,
      action: 'share',
      location: 'New York',
      platform: 'macOS',
      icon: Share2Icon,
      color: 'bg-cyan-500',
    },
    {
      id: 1730663790075.3435,
      action: 'like',
      location: 'Copenhagen',
      platform: 'iOS',
      icon: HeartIcon,
      color: 'bg-pink-500',
    },
    {
      id: 1730663788070.351,
      action: 'recommend',
      location: 'Oslo',
      platform: 'Android',
      icon: ThumbsUpIcon,
      color: 'bg-orange-500',
    },
    {
      id: 1730663786074.429,
      action: 'read',
      location: 'New York',
      platform: 'Windows',
      icon: BookOpenIcon,
      color: 'bg-teal-500',
    },
    {
      id: 1730663784065.6309,
      action: 'sign up',
      location: 'Gothenburg',
      platform: 'iOS',
      icon: UserPlusIcon,
      color: 'bg-green-500',
    },
  ]);

  useEffect(() => {
    // Prepend new event every 2 seconds
    const interval = setInterval(() => {
      setEvents((prevEvents) => [
        generateEvent(),
        ...prevEvents.slice(0, TOTAL_EVENTS - 1),
      ]);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="overflow-hidden p-8 max-h-[700px]">
      <div
        className="min-w-[500px] gap-4 flex flex-col overflow-hidden relative isolate"
        // style={{ height: 60 * TOTAL_EVENTS + 16 * (TOTAL_EVENTS - 1) }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {events.map((event) => (
            <motion.div
              key={event.id}
              className="flex items-center shadow bg-background-light rounded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: '60px' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{
                duration: 0.3,
                type: 'spring',
                stiffness: 500,
                damping: 50,
                opacity: { duration: 0.2 },
              }}
            >
              <div className="flex items-center gap-2 w-[200px] py-2 px-4">
                <div
                  className={`size-8 rounded-full bg-background flex items-center justify-center ${event.color} text-white  `}
                >
                  {event.icon && <event.icon size={16} />}
                </div>
                <span className="font-medium truncate">{event.action}</span>
              </div>
              <div className="w-[150px] py-2 px-4 truncate">
                <span className="mr-2 text-xl relative top-px">
                  {getCountryFlag(event.location)}
                </span>
                {event.location}
              </div>
              <div className="w-[150px] py-2 px-4 truncate">
                <span className="mr-2 text-xl relative top-px">
                  {getPlatformIcon(event.platform)}
                </span>
                {event.platform}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Helper function to generate events (moved outside component)
function generateEvent() {
  const actions = [
    { text: 'sign up', icon: UserPlusIcon, color: 'bg-green-500' },
    { text: 'purchase', icon: ShoppingCartIcon, color: 'bg-blue-500' },
    { text: 'screen view', icon: EyeIcon, color: 'bg-purple-500' },
    { text: 'logout', icon: LogOutIcon, color: 'bg-red-500' },
    { text: 'like', icon: HeartIcon, color: 'bg-pink-500' },
    { text: 'comment', icon: MessageSquareIcon, color: 'bg-indigo-500' },
    { text: 'share', icon: Share2Icon, color: 'bg-cyan-500' },
    { text: 'download', icon: DownloadIcon, color: 'bg-emerald-500' },
    { text: 'notification', icon: BellIcon, color: 'bg-violet-500' },
    { text: 'settings', icon: SettingsIcon, color: 'bg-slate-500' },
    { text: 'search', icon: SearchIcon, color: 'bg-violet-500' },
    { text: 'read', icon: BookOpenIcon, color: 'bg-teal-500' },
    { text: 'recommend', icon: ThumbsUpIcon, color: 'bg-orange-500' },
    { text: 'favorite', icon: StarIcon, color: 'bg-yellow-500' },
  ];

  const selectedAction = actions[Math.floor(Math.random() * actions.length)];

  return {
    id: Date.now() + Math.random(),
    action: selectedAction.text,
    location: locations[Math.floor(Math.random() * locations.length)],
    platform: platforms[Math.floor(Math.random() * platforms.length)],
    icon: selectedAction.icon,
    color: selectedAction.color,
  };
}
