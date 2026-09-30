import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/iframe-test')({
  component: IframeTestLayout,
});

function IframeTestLayout() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/openpanel-embed.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  return (
    <div className="w-full min-h-screen center-center p-8">
      <div className="border-8 border-border rounded-lg p-4 w-full max-w-5xl space-y-3">
        <p className="text-sm text-muted-foreground">
          Local harness for share embeds. Point the iframe at a public share URL
          and confirm the frame grows with content and modals stay in view.
        </p>
        <iframe
          data-openpanel-embed
          src="/share/overview/demo"
          style={{ width: '100%', minHeight: 400 }}
          title="OpenPanel share embed test"
        />
      </div>
    </div>
  );
}
