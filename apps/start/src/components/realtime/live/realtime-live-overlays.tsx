import { LiveCounter } from './live-counter';
import { LiveEventFeed } from './live-event-feed';
import { LiveSessionFeed } from './live-session-feed';
import { LiveTopIsland } from './live-top-island';
import { LiveVisitorBars } from './live-visitor-bars';

/** Sits over the map; only the cards take pointer events so the map still pans. */
export function RealtimeLiveOverlays({ projectId }: { projectId: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute top-6 bottom-36 left-6 hidden w-72 flex-col gap-6 md:flex">
        <LiveCounter projectId={projectId} />
        <LiveSessionFeed projectId={projectId} />
      </div>

      <div className="absolute top-6 right-6 bottom-36 hidden w-72 flex-col gap-6 md:flex">
        <LiveVisitorBars projectId={projectId} />
        <LiveEventFeed projectId={projectId} />
      </div>

      <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
        <LiveTopIsland projectId={projectId} />
      </div>
    </div>
  );
}
