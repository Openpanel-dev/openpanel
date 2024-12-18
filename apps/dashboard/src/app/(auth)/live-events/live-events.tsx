'use client';

import { EventListItem } from '@/components/events/event-list-item';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import type { IServiceEventMinimal } from '@openpanel/db';

const useWebEventGenerator = () => {
  const [events, setEvents] = useState<IServiceEventMinimal[]>([]);

  const eventNames = [
    'screen_view',
    'session_start',
    'session_end',
    'submit_form',
    'sign_in',
    'sign_up',
    'purchase_flow',
    'purchase_flow_completed',
    'subscription_started',
  ];
  const browsers = [
    'Chrome WebView',
    'Firefox',
    'Safari',
    'Edge',
    'Chrome',
    'Opera',
    'Internet Explorer',
  ];
  const paths = [
    '/features/',
    '/contact/',
    '/about/',
    '/pricing/',
    '/blog/',
    '/signup/',
    '/login/',
  ];
  const countries = [
    'BY',
    'US',
    'FR',
    'IN',
    'DE',
    'JP',
    'BR',
    'ZA',
    'EG',
    'AU',
    'RU',
    'CN',
    'IT',
    'GB',
    'CA',
  ];
  const os = [
    'Windows',
    'MacOS',
    'iOS',
    'Android',
    'Linux',
    'Chrome OS',
    'Windows Phone',
  ];

  // Function to generate a random event
  const generateEvent = (index?: number): IServiceEventMinimal => {
    const event = {
      id: Math.random().toString(36).substring(2, 15),
      name: eventNames[Math.floor(Math.random() * eventNames.length)]!,
      projectId: 'marketing-site',
      sessionId: Math.random().toString(36).substring(2, 15),
      createdAt: new Date(new Date().getTime() - (index || 0) * 1000),
      country: countries[Math.floor(Math.random() * countries.length)],
      longitude: 27.5709,
      latitude: 53.9007,
      os: os[Math.floor(Math.random() * os.length)],
      browser: browsers[Math.floor(Math.random() * browsers.length)],
      device: 'mobile',
      brand: 'Xiaomi',
      duration: 0,
      path: paths[Math.floor(Math.random() * paths.length)]!,
      origin: 'https://www.voxie.com',
      referrer: 'https://syndicatedsearch.goog',
      meta: undefined,
      minimal: true,
    };

    return event;
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    // Generate initial 30 events
    const initialEvents = Array.from({ length: 30 }).map((_, index) => {
      return generateEvent(index);
    });
    setEvents(initialEvents);

    function createNewEvent() {
      const newEvent = generateEvent();
      setEvents((prevEvents) => [newEvent, ...prevEvents]);
      timer = setTimeout(() => createNewEvent(), Math.random() * 3000);
    }

    createNewEvent();

    return () => clearInterval(timer);
  }, []);

  return events;
};

const LiveEvents = () => {
  const state = useWebEventGenerator();

  return (
    <div className="hide-scrollbar h-screen overflow-y-auto">
      <div className="text-background-foreground py-16 text-center text-2xl font-bold">
        Real time data
        <br />
        at your fingertips
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <div className="flex flex-col gap-4 p-4">
          {state.map((event) => (
            <motion.div
              key={event.id}
              layout
              initial={{ opacity: 0, x: -400, scale: 0.5 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 200, scale: 1.2 }}
              transition={{ duration: 0.6, type: 'spring' }}
            >
              <EventListItem {...event} minimal />
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
};

export default LiveEvents;
