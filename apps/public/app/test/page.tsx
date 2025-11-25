'use client';

import { Button } from '@/components/ui/button';
import { useOpenPanel } from '@openpanel/nextjs';

export default function TestPage() {
  const op = useOpenPanel();
  return (
    <div>
      <h1>Test Page</h1>
      <Button
        onClick={async () => {
          const deviceId = await op.fetchDeviceId();
          alert(`Device ID: ${deviceId}`);
        }}
      >
        Fetch device id
      </Button>
      <Button onClick={() => op.track('hello')}>Hello</Button>
      <Button onClick={() => op.revenue(100)}>Revenue</Button>
    </div>
  );
}
