import { type IClickhouseEvent, ch, createEvent } from '@openpanel/db';
import { formatClickhouseDate } from '@openpanel/db';
import { v4 as uuid } from 'uuid';

async function main() {
  const startDate = new Date('2025-01-01T00:00:00Z');
  const endDate = new Date();
  const eventsPerDay = 25000;
  const variance = 3000;

  // Event names to randomly choose from
  const eventNames = ['click', 'purchase', 'signup', 'login', 'screen_view'];

  // Loop through each day
  for (
    let currentDate = startDate;
    currentDate <= endDate;
    currentDate.setDate(currentDate.getDate() + 1)
  ) {
    const events: IClickhouseEvent[] = [];
    // Calculate random number of events for this day
    const dailyEvents =
      eventsPerDay + Math.floor(Math.random() * variance * 2) - variance;

    // Create events for the day
    for (let i = 0; i < dailyEvents; i++) {
      const eventTime = new Date(currentDate);
      // Distribute events throughout the day
      eventTime.setHours(Math.floor(Math.random() * 24));
      eventTime.setMinutes(Math.floor(Math.random() * 60));
      eventTime.setSeconds(Math.floor(Math.random() * 60));

      events.push({
        id: uuid(),
        name: eventNames[Math.floor(Math.random() * eventNames.length)]!,
        device_id: `device_${Math.floor(Math.random() * 1000)}`,
        profile_id: `profile_${Math.floor(Math.random() * 1000)}`,
        project_id: 'testing',
        session_id: `session_${Math.floor(Math.random() * 10000)}`,
        properties: {
          hash: 'test-hash',
          'query.utm_source': 'test',
          __reqId: `req_${Math.floor(Math.random() * 1000)}`,
          __user_agent: 'Mozilla/5.0 (Test)',
        },
        created_at: formatClickhouseDate(eventTime),
        country: 'US',
        city: 'New York',
        region: 'NY',
        longitude: -74.006,
        latitude: 40.7128,
        os: 'macOS',
        os_version: '13.0',
        browser: 'Chrome',
        browser_version: '120.0',
        device: 'desktop',
        brand: 'Apple',
        model: 'MacBook Pro',
        duration: Math.floor(Math.random() * 300),
        path: `/page-${Math.floor(Math.random() * 20)}`,
        origin: 'https://example.com',
        referrer: 'https://google.com',
        referrer_name: 'Google',
        referrer_type: 'search',
        imported_at: null,
        sdk_name: 'test-script',
        sdk_version: '1.0.0',
      });
    }

    await ch.insert({
      table: 'events',
      values: events,
      format: 'JSONEachRow',
    });

    // Log progress
    console.log(
      `Created ${dailyEvents} events for ${currentDate.toISOString().split('T')[0]}`,
    );
  }
}

main().catch(console.error);
