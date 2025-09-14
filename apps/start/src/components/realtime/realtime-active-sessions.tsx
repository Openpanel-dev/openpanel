'use client';

import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import useWS from '@/hooks/use-ws';
import { timeAgo } from '@/utils/date';
import { EventIcon } from '../events/event-icon';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { ScrollArea } from '../ui/scroll-area';

interface RealtimeActiveSessionsProps {
  projectId: string;
  limit?: number;
}

type ActiveSession = {
  id: string;
  country: string;
  city: string;
  longitude: number;
  latitude: number;
  path: string;
  origin: string;
  referrer_name: string;
  browser: string;
  os: string;
  name: string;
  device: string;
  created_at: Date;
  meta?: any;
};

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

  const [state, setState] = useState<ActiveSession[]>([]);

  // Update state when initial data loads
  useEffect(() => {
    if (activeSessionsQuery.data) {
      setState(activeSessionsQuery.data);
    }
  }, [activeSessionsQuery.data]);

  // Set up WebSocket connection for real-time updates
  useWS<ActiveSession>(`/live/sessions/${projectId}`, (session) => {
    setState((prev) => {
      // Add new session and remove duplicates, keeping most recent
      const filtered = prev.filter((s) => s.id !== session.id);
      return [session, ...filtered].slice(0, limit);
    });
  });

  const sessions = state.length > 0 ? state : (activeSessionsQuery.data ?? []);

  return (
    <div className="col h-full">
      <ScrollArea>
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
                <div className="row gap-2 bg-background/90 card p-4">
                  <EventIcon
                    size="sm"
                    name={session.name}
                    meta={session.meta}
                  />
                  <div className="col min-w-0">
                    <div className="truncate flex-1 font-medium">
                      {session.path}
                    </div>
                    <div className="row items-center gap-2 mt-1">
                      <SerieIcon name={session.country} />
                      <SerieIcon name={session.device} />
                      <SerieIcon name={session.os} />
                      <SerieIcon name={session.browser} />
                      <SerieIcon name={session.referrer_name} />
                      <span className="text-muted-foreground text-sm">
                        {timeAgo(session.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}
