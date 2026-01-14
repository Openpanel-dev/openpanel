import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/widget/test')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="center-center h-screen w-screen gap-4">
      <iframe
        title="Realtime Widget"
        src="http://localhost:3000/widget/realtime?shareId=qkC561&limit=2"
        width="300"
        height="400"
        className="rounded-xl border"
      />
      <iframe
        title="Realtime Widget"
        src="http://localhost:3000/widget/realtime?shareId=qkC562&limit=2"
        width="300"
        height="400"
        className="rounded-xl border"
      />
      <iframe
        title="Counter Widget"
        src="http://localhost:3000/widget/counter?shareId=qkC561"
        height="32"
        width="auto"
        frameBorder="0"
        className="rounded-xl border"
      />
    </div>
  );
}
