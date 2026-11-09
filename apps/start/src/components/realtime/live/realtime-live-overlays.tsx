import { useMediaQuery } from 'usehooks-ts';
import type { RealtimeWidgetId } from './live-layout';
import { LiveToolbar } from './live-toolbar';
import { LiveTopIsland } from './live-top-island';
import { REALTIME_WIDGETS } from './live-widgets';
import { useRealtimeLayout } from './use-realtime-layout';
import { cn } from '@/utils/cn';

/** Tailwind's `md` breakpoint, where the columns and Customize appear. */
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

function LiveColumn({
  label,
  widgets,
  projectId,
  className,
}: {
  label: string;
  widgets: RealtimeWidgetId[];
  projectId: string;
  className: string;
}) {
  return (
    <aside
      aria-label={label}
      className={cn(
        'absolute top-6 bottom-36 hidden w-72 flex-col gap-6 md:flex',
        className
      )}
    >
      {widgets.map((id) => {
        const { Component } = REALTIME_WIDGETS[id];
        return <Component key={id} projectId={projectId} />;
      })}
    </aside>
  );
}

/** Sits over the map; only the cards take pointer events so the map still pans. */
export function RealtimeLiveOverlays({ projectId }: { projectId: string }) {
  const { layout, saveLayout, resetLayout } = useRealtimeLayout(projectId);
  // Customize is desktop-only, so a narrow screen always shows the bar.
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const showIsland = Boolean(layout?.showIsland) || !isDesktop;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <LiveToolbar
        layout={layout}
        onLayoutChange={saveLayout}
        onLayoutReset={resetLayout}
        projectId={projectId}
      />

      {layout ? (
        <>
          <LiveColumn
            className="left-6"
            label="Left column"
            projectId={projectId}
            widgets={layout.left}
          />
          <LiveColumn
            className="right-6"
            label="Right column"
            projectId={projectId}
            widgets={layout.right}
          />
          {showIsland ? (
            <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
              <LiveTopIsland projectId={projectId} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
