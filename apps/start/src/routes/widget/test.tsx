import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/widget/test')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="center-center h-screen w-screen gap-4">
      <iframe
        className="rounded-xl border"
        height="400"
        src="http://localhost:3000/widget/realtime?shareId=qkC561&limit=2"
        title="Realtime Widget"
        width="300"
      />
      <iframe
        className="rounded-xl border"
        height="400"
        src="http://localhost:3000/widget/realtime?shareId=qkC562&limit=2"
        title="Realtime Widget"
        width="300"
      />
      <iframe
        className="rounded-xl border"
        frameBorder="0"
        height="32"
        src="http://localhost:3000/widget/counter?shareId=qkC561"
        title="Counter Widget"
        width="auto"
      />
    </div>
  );
}
