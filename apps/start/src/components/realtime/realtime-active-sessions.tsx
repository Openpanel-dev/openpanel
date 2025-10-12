'use client';

import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import useWS from '@/hooks/use-ws';
import type { IServiceEvent } from '@openpanel/db';
import { EventItem } from '../events/table/item';

interface RealtimeActiveSessionsProps {
  projectId: string;
  limit?: number;
}

export function RealtimeActiveSessions({
  projectId,
  limit = 10,
}: RealtimeActiveSessionsProps) {
  const trpc = useTRPC();
  const activeSessionsQuery = useQuery(
    trpc.realtime.activeSessions.queryOptions({
      projectId,
    }),
  );

  const [state, setState] = useState<IServiceEvent[]>([]);

  // Update state when initial data loads
  useEffect(() => {
    if (activeSessionsQuery.data && state.length === 0) {
      setState(activeSessionsQuery.data);
    }
  }, [activeSessionsQuery.data, state]);

  // Set up WebSocket connection for real-time updates
  useWS<IServiceEvent>(`/live/events/${projectId}`, (session) => {
    setState((prev) => {
      // Add new session and remove duplicates, keeping most recent
      const filtered = prev.filter((s) => s.id !== session.id);
      return [session, ...filtered].slice(0, limit);
    });
  });

  const sessions = state.length > 0 ? state : (activeSessionsQuery.data ?? []);

  return (
    <div className="col h-full">
      <div className="hide-scrollbar h-full overflow-y-auto pb-10">
        <AnimatePresence mode="popLayout" initial={false}>
          <div className="col gap-4">
            {sessions.map((session) => (
              <motion.div
                key={session.id}
                layout
                // initial={{ opacity: 0, x: -200, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 200, scale: 0.8 }}
                transition={{ duration: 0.4, type: 'spring', stiffness: 300 }}
              >
                <EventItem
                  event={session}
                  viewOptions={{
                    properties: false,
                    origin: false,
                    queryString: false,
                  }}
                  className="w-full"
                />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </div>
    </div>
  );
}
