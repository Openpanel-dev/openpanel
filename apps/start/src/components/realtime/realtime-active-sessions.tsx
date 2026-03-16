import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ProjectLink } from '../links';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { useTRPC } from '@/integrations/trpc/react';
import { formatTimeAgoOrDateTime } from '@/utils/date';

interface RealtimeActiveSessionsProps {
  projectId: string;
  limit?: number;
}

export function RealtimeActiveSessions({
  projectId,
  limit = 10,
}: RealtimeActiveSessionsProps) {
  const trpc = useTRPC();
  const { data: sessions = [] } = useQuery(
    trpc.realtime.activeSessions.queryOptions(
      { projectId },
      { refetchInterval: 5000 }
    )
  );

  return (
    <div className="col card h-full max-md:hidden">
      <div className="hide-scrollbar h-full overflow-y-auto">
        <AnimatePresence initial={false} mode="popLayout">
          <div className="col divide-y">
            {sessions.slice(0, limit).map((session) => (
              <motion.div
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 200, scale: 0.8 }}
                key={session.id}
                layout
                transition={{ duration: 0.4, type: 'spring', stiffness: 300 }}
              >
                <ProjectLink
                  className="relative block p-4 py-3 pr-14"
                  href={`/sessions/${session.sessionId}`}
                >
                  <div className="col flex-1 gap-1">
                    {session.name === 'screen_view' && (
                      <span className="text-muted-foreground text-xs leading-normal/80">
                        {session.origin}
                      </span>
                    )}
                    <span className="font-medium text-sm leading-normal">
                      {session.name === 'screen_view'
                        ? session.path
                        : session.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatTimeAgoOrDateTime(session.createdAt)}
                    </span>
                  </div>
                  <div className="row absolute top-1/2 right-4 origin-right -translate-y-1/2 scale-50 gap-2">
                    <SerieIcon name={session.referrerName} />
                    <SerieIcon name={session.os} />
                    <SerieIcon name={session.browser} />
                    <SerieIcon name={session.device} />
                  </div>
                </ProjectLink>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </div>
    </div>
  );
}
