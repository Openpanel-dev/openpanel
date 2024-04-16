'use client';

import { useState } from 'react';
import { EventListItem } from '@/app/(app)/[organizationSlug]/[projectId]/events/event-list-item';
import useWS from '@/hooks/useWS';
import { AnimatePresence, motion } from 'framer-motion';

import type { IServiceEventMinimal } from '@openpanel/db';

type Props = {
  events: IServiceEventMinimal[];
};

const LiveEvents = ({ events }: Props) => {
  const [state, setState] = useState(events ?? []);
  useWS<IServiceEventMinimal>('/live/events', (event) => {
    setState((p) => [event, ...p].slice(0, 30));
  });
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
