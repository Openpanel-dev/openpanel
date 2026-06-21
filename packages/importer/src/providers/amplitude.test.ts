import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { AmplitudeProvider, type AmplitudeRawEvent } from './amplitude';
import { toCountryCode } from './country-codes';

async function collect(
  gen: AsyncGenerator<AmplitudeRawEvent, void, unknown>
): Promise<AmplitudeRawEvent[]> {
  const out: AmplitudeRawEvent[] = [];
  for await (const event of gen) {
    out.push(event);
  }
  return out;
}

const baseConfig = {
  provider: 'amplitude' as const,
  type: 'api' as const,
  apiKey: 'test-api-key',
  secretKey: 'test-secret-key',
  from: '2025-02-01',
  to: '2025-02-28',
};

function loadFixture(): AmplitudeRawEvent[] {
  const raw = readFileSync(
    join(__dirname, '__fixtures__', 'amplitude-export.json'),
    'utf-8'
  );
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AmplitudeRawEvent);
}

describe('amplitude', () => {
  it('generates session IDs in SQL (Segment exports have none)', () => {
    const provider = new AmplitudeProvider('pid', baseConfig);
    expect(provider.shouldGenerateSessionIds()).toBe(true);
  });

  it('transforms a mobile (Segment iOS) event', () => {
    const provider = new AmplitudeProvider('pid', baseConfig);

    const rawEvent = {
      event_type: 'Application Opened',
      event_properties: { build: '5', from_background: true, version: '201' },
      user_properties: {},
      device_id: 'AAAAAAAA-0000-0000-0000-000000000001',
      user_id: 'user-001',
      amplitude_id: 100_000_000_001,
      event_time: '2025-02-05 22:58:30.568000',
      client_event_time: '2025-02-05 22:58:30.568000',
      country: 'Sweden',
      city: 'Stockholm',
      region: 'Stockholm County',
      platform: 'iOS',
      os_name: 'ios',
      os_version: '17.6.1',
      device_family: 'Apple iPhone',
      device_type: 'Apple iPhone 12 Mini',
      language: 'English',
      version_name: '201',
      library: 'segment',
      $insert_id: '00000000-0000-4000-8000-000000000005',
      uuid: '00000000-0000-4000-8000-0000000000a5',
    } satisfies AmplitudeRawEvent;

    const res = provider.transformEvent(rawEvent);

    expect(res.id.length).toBeGreaterThan(30);
    expect(res.imported_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(res).toMatchObject({
      name: 'Application Opened',
      device_id: 'AAAAAAAA-0000-0000-0000-000000000001',
      profile_id: 'user-001',
      project_id: 'pid',
      session_id: '',
      created_at: '2025-02-05 22:58:30',
      country: 'SE',
      city: 'Stockholm',
      region: 'Stockholm County',
      os: 'iOS',
      os_version: '17.6.1',
      browser: '',
      device: 'mobile',
      brand: 'Apple',
      model: 'Apple iPhone 12 Mini',
      path: '',
      sdk_name: 'amplitude (segment)',
      sdk_version: '1.0.0',
      properties: {
        build: '5',
        from_background: 'true',
        version: '201',
        __source_insert_id: '00000000-0000-4000-8000-000000000005',
        __language: 'English',
        __version: '201',
      },
    });
  });

  it('falls back to amplitude_id for device, device for profile', () => {
    const provider = new AmplitudeProvider('pid', baseConfig);
    const res = provider.transformEvent({
      event_type: 'Custom',
      event_properties: {},
      user_properties: {},
      amplitude_id: 123,
      event_time: '2025-02-05 22:58:30.568000',
    } as AmplitudeRawEvent);

    expect(res.device_id).toBe('123');
    expect(res.profile_id).toBe('123');
  });

  it('maps page-view system events to screen_view', () => {
    const provider = new AmplitudeProvider('pid', baseConfig);
    const res = provider.transformEvent({
      event_type: '[Amplitude] Page Viewed',
      event_properties: {},
      user_properties: {},
      device_id: 'd1',
      event_time: '2025-02-05 22:58:30.568000',
    } as AmplitudeRawEvent);
    expect(res.name).toBe('screen_view');
  });

  it('streams plain (uncompressed) NDJSON', async () => {
    const provider = new AmplitudeProvider('pid', baseConfig);
    const ndjson = `${JSON.stringify({ event_type: 'A', device_id: 'd1' })}\n${JSON.stringify(
      { event_type: 'B', device_id: 'd2' }
    )}\n`;

    const events = await collect(
      provider.streamNdjson(
        Readable.from(Buffer.from(ndjson)),
        'https://example.com/export.json'
      )
    );

    expect(events.map((e) => e.event_type)).toEqual(['A', 'B']);
  });

  it('streams gzipped NDJSON by detecting magic bytes', async () => {
    const provider = new AmplitudeProvider('pid', baseConfig);
    const ndjson = `${JSON.stringify({ event_type: 'A', device_id: 'd1' })}\n`;
    const gz = gzipSync(Buffer.from(ndjson));

    const events = await collect(
      provider.streamNdjson(Readable.from(gz), 'https://example.com/export.json.gz')
    );

    expect(events.map((e) => e.event_type)).toEqual(['A']);
  });

  it('does not double-decompress when fetch already decoded transport gzip', async () => {
    // Reproduces "incorrect header check": a .json URL whose bytes are already
    // plain JSON must not be gunzipped just because the server used gzip transport.
    const provider = new AmplitudeProvider('pid', baseConfig);
    const ndjson = `${JSON.stringify({ event_type: 'A', device_id: 'd1' })}\n`;

    const events = await collect(
      provider.streamNdjson(
        Readable.from(Buffer.from(ndjson)),
        'https://example.com/amplitude.json'
      )
    );

    expect(events.map((e) => e.event_type)).toEqual(['A']);
  });

  it('derives a profile from an event with a user_id', () => {
    const provider = new AmplitudeProvider('pid', baseConfig);
    const profile = provider.transformEventToProfile({
      event_type: 'Custom',
      event_properties: {},
      user_properties: {
        email: 'jane@example.com',
        firstName: 'Jane',
        last_name: 'Doe',
        plan: 'pro',
        nested: { a: 1 },
      },
      device_id: 'd1',
      user_id: 'user-001',
      event_time: '2025-02-05 22:58:30.568000',
    } as AmplitudeRawEvent);

    expect(profile).not.toBeNull();
    expect(profile).toMatchObject({
      id: 'user-001',
      project_id: 'pid',
      email: 'jane@example.com',
      first_name: 'Jane',
      last_name: 'Doe',
      is_external: true,
      created_at: '2025-02-05 22:58:30',
      last_seen_at: '2025-02-05 22:58:30',
      properties: { plan: 'pro', nested: '{"a":1}' },
    });
    // known identity keys are not duplicated into the properties bag
    expect(profile?.properties.email).toBeUndefined();
    expect(profile?.properties.firstName).toBeUndefined();
  });

  it('returns null for anonymous events (no user_id or user_id === device_id)', () => {
    const provider = new AmplitudeProvider('pid', baseConfig);

    expect(
      provider.transformEventToProfile({
        event_type: 'Custom',
        event_properties: {},
        user_properties: {},
        device_id: 'd1',
        event_time: '2025-02-05 22:58:30.568000',
      } as AmplitudeRawEvent)
    ).toBeNull();

    expect(
      provider.transformEventToProfile({
        event_type: 'Custom',
        event_properties: {},
        user_properties: {},
        device_id: 'd1',
        user_id: 'd1',
        event_time: '2025-02-05 22:58:30.568000',
      } as AmplitudeRawEvent)
    ).toBeNull();
  });

  it('maps Amplitude country names to ISO alpha-2 (FixedString(2) safe)', () => {
    expect(toCountryCode('Nigeria')).toBe('NG');
    expect(toCountryCode('United States')).toBe('US');
    expect(toCountryCode('Russia')).toBe('RU');
    expect(toCountryCode('South Korea')).toBe('KR');
    expect(toCountryCode('Czechia')).toBe('CZ');
    // Already a code
    expect(toCountryCode('US')).toBe('US');
    expect(toCountryCode('se')).toBe('SE');
    // Unknown / empty → '' so the FixedString(2) insert never overflows
    expect(toCountryCode('Testland')).toBe('');
    expect(toCountryCode('')).toBe('');
    expect(toCountryCode(null)).toBe('');
    expect(toCountryCode(undefined)).toBe('');
  });

  it('transforms every event in the real export without throwing', () => {
    const provider = new AmplitudeProvider('pid', baseConfig);
    const events = loadFixture();
    expect(events.length).toBeGreaterThan(0);

    for (const raw of events) {
      expect(provider.validate(raw)).toBe(true);
      const res = provider.transformEvent(raw);
      expect(res.name).toBeTruthy();
      expect(res.device_id).toBeTruthy();
      expect(res.session_id).toBe('');
      expect(res.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      // country must always be storable in FixedString(2)
      expect(res.country.length).toBeLessThanOrEqual(2);
    }
  });
});
