import type { RealtimeWidgetId } from './live-layout';
import { LiveToolbar } from './live-toolbar';
import { LiveTopIsland } from './live-top-island';
import { REALTIME_WIDGETS } from './live-widgets';
import { useRealtimeLayout } from './use-realtime-layout';
import { cn } from '@/utils/cn';

function LiveColumn({
  widgets,
  projectId,
  className,
}: {
  widgets: RealtimeWidgetId[];
  projectId: string;
  className: string;
}) {
  return (
    <div
      className={cn(
        'absolute top-6 bottom-36 hidden w-72 flex-col gap-6 md:flex',
        className
      )}
    >
      {widgets.map((id) => {
        const { Component } = REALTIME_WIDGETS[id];
        return <Component key={id} projectId={projectId} />;
      })}
    </div>
  );
}

/** Sits over the map; only the cards take pointer events so the map still pans. */
export function RealtimeLiveOverlays({ projectId }: { projectId: string }) {
  const { layout, saveLayout, resetLayout } = useRealtimeLayout(projectId);

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
            projectId={projectId}
            widgets={layout.left}
          />
          <LiveColumn
            className="right-6"
            projectId={projectId}
            widgets={layout.right}
          />
          {layout.showIsland ? (
            <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
              <LiveTopIsland projectId={projectId} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
