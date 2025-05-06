'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

const PROFILES = [
  {
    name: 'Joe Bloggs',
    email: 'joe@bloggs.com',
    avatar: '/avatar.jpg',
    stats: {
      firstSeen: 'about 2 months',
      lastSeen: '41 minutes',
      sessions: '8',
      avgSession: '5m 59s',
      p90Session: '7m 42s',
      pageViews: '41',
    },
  },
  {
    name: 'Jane Smith',
    email: 'jane@smith.com',
    avatar: '/avatar-2.jpg',
    stats: {
      firstSeen: 'about 1 month',
      lastSeen: '2 hours',
      sessions: '12',
      avgSession: '4m 32s',
      p90Session: '6m 15s',
      pageViews: '35',
    },
  },
  {
    name: 'Alex Johnson',
    email: 'alex@johnson.com',
    avatar: '/avatar-3.jpg',
    stats: {
      firstSeen: 'about 3 months',
      lastSeen: '15 minutes',
      sessions: '15',
      avgSession: '6m 20s',
      p90Session: '8m 10s',
      pageViews: '52',
    },
  },
];

export function ProfilesFeature() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      if (currentIndex === PROFILES.length) {
        setIsTransitioning(false);
        setCurrentIndex(0);
        setTimeout(() => setIsTransitioning(true), 50);
      } else {
        setCurrentIndex((current) => current + 1);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [currentIndex]);

  return (
    <div className="overflow-hidden">
      <div
        className={`flex ${isTransitioning ? 'transition-transform duration-500 ease-in-out' : ''}`}
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {[...PROFILES, PROFILES[0]].map((profile, index) => (
          <div
            key={profile.name + index.toString()}
            className="w-full flex-shrink-0 p-8"
          >
            <div className="col md:row justify-center md:justify-start items-center gap-4">
              <Image
                src={profile.avatar}
                className="size-32 rounded-full"
                width={128}
                height={128}
                alt={profile.name}
              />
              <div>
                <div className="text-3xl font-semibold">{profile.name}</div>
                <div className="text-muted-foreground text-center md:text-left">
                  {profile.email}
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 bg-background-light">
                <div className="text-sm text-muted-foreground">First seen</div>
                <div className="text-lg font-medium">
                  {profile.stats.firstSeen}
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-background-light">
                <div className="text-sm text-muted-foreground">Last seen</div>
                <div className="text-lg font-medium">
                  {profile.stats.lastSeen}
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-background-light">
                <div className="text-sm text-muted-foreground">Sessions</div>
                <div className="text-lg font-medium">
                  {profile.stats.sessions}
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-background-light">
                <div className="text-sm text-muted-foreground">
                  Avg. Session
                </div>
                <div className="text-lg font-medium">
                  {profile.stats.avgSession}
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-background-light">
                <div className="text-sm text-muted-foreground">
                  P90. Session
                </div>
                <div className="text-lg font-medium">
                  {profile.stats.p90Session}
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-background-light">
                <div className="text-sm text-muted-foreground">Page views</div>
                <div className="text-lg font-medium">
                  {profile.stats.pageViews}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
