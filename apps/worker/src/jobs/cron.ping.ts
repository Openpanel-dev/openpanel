import { TABLE_NAMES, chQuery } from '@openpanel/db';

export async function ping() {
  const [res] = await chQuery<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLE_NAMES.events}`,
  );

  if (typeof res?.count === 'number') {
    const response = await fetch('https://api.openpanel.dev/misc/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domain: process.env.NEXT_PUBLIC_DASHBOARD_URL,
        count: res?.count,
      }),
    });

    if (response.ok) {
      return await response.json();
    }

    throw new Error('Failed to ping the server');
  }
}
