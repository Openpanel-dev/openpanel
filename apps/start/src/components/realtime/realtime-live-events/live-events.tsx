'use client';

import { EventListItem } from '@/components/events/event-list-item';
import useWS from '@/hooks/useWS';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import type { IServiceEvent, IServiceEventMinimal } from '@openpanel/db';

type Props = {
  events: (IServiceEventMinimal | IServiceEvent)[];
  projectId: string;
  limit: number;
};

const RealtimeLiveEvents = ({ events, projectId, limit }: Props) => {
  const [state, setState] = useState(events ?? []);
  useWS<IServiceEventMinimal | IServiceEvent>(
    `/live/events/${projectId}`,
    (event) => {
      setState((p) => [event, ...p].slice(0, limit));
    },
  );
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <div className="flex gap-4">
        {state.map((event) => (
          <motion.div
            key={event.id}
            layout
            initial={{ opacity: 0, y: -200, x: 0, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: 0, x: 200, scale: 1.2 }}
            transition={{ duration: 0.6, type: 'spring' }}
          >
            <div className="w-[380px]">
              <EventListItem {...event} />
            </div>
          </motion.div>
        ))}
      </div>
    </AnimatePresence>
  );
};

export default RealtimeLiveEvents;
