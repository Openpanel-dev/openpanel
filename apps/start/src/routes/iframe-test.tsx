import { ScriptOnce, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

export const Route = createFileRoute('/iframe-test')({
  component: IframeTestLayout,
});

function IframeTestLayout() {
  return (
    <div className="w-full h-full center-center p-32">
      <div className="border-8 border-border rounded-lg p-4 w-full max-w-5xl">
        <iframe
          data-openpanel-embed
          src="http://localhost:3000/share/overview/zef2XC"
          style={{
            width: '100%',
            height: '100%',
            minHeight: '100vh',
          }}
          scrolling="no"
          loading="lazy"
          title="OpenPanel Dashboard"
        />
      </div>
      <script src="/openpanel-embed.js" />
    </div>
  );
}
