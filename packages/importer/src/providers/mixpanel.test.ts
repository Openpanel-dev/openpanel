import { omit } from 'ramda';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MixpanelProvider } from './mixpanel';

describe('mixpanel', () => {
  it('should chunk date range into day chunks', async () => {
    const provider = new MixpanelProvider('pid', {
      from: '2025-01-01',
      to: '2025-01-04',
      serviceAccount: 'sa',
      serviceSecret: 'ss',
      projectId: '123',
      provider: 'mixpanel',
      type: 'api',
      mapScreenViewProperty: undefined,
    });

    const chunks = provider.getDateChunks('2025-01-01', '2025-01-04');
    expect(chunks).toEqual([
      ['2025-01-01', '2025-01-01'],
      ['2025-01-02', '2025-01-02'],
      ['2025-01-03', '2025-01-03'],
      ['2025-01-04', '2025-01-04'],
    ]);
  });

  it('should transform event', async () => {
    const provider = new MixpanelProvider('pid', {
      from: '2025-01-01',
      to: '2025-01-02',
      serviceAccount: 'sa',
      serviceSecret: 'ss',
      projectId: '123',
      provider: 'mixpanel',
      type: 'api',
      mapScreenViewProperty: undefined,
    });

    const rawEvent = {
      event: '$mp_web_page_view',
      properties: {
        time: 1_746_097_970,
        distinct_id: '$device:123',
        $browser: 'Chrome',
        $browser_version: 135,
        $city: 'Mumbai',
        $current_url:
          'https://domain.com/state/maharashtra?utm_source=google&utm_medium=cpc&utm_campaignid=890&utm_adgroupid=&utm_adid=&utm_term=&utm_device=m&utm_network=x&utm_location=123&gclid=oqneoqow&gad_sour',
        $device: 'Android',
        $device_id: '123',
        $initial_referrer: 'https://referrer.com/',
        $initial_referring_domain: 'referrer.com',
        $insert_id: 'source_id',
        $lib_version: '2.60.0',
        $mp_api_endpoint: 'api-js.mixpanel.com',
        $mp_api_timestamp_ms: 1_746_078_175_363,
        $mp_autocapture: true,
        $os: 'Android',
        $referrer: 'https://google.com/',
        $referring_domain: 'referrer.com',
        $region: 'Maharashtra',
        $screen_height: 854,
        $screen_width: 384,
        current_domain: 'domain.com',
        current_page_title:
          'Landeed: Satbara Utara, 7/12 Extract, Property Card & Index 2',
        current_url_path: '/state/maharashtra',
        current_url_protocol: 'https:',
        current_url_search:
          '?utm_source=google&utm_medium=cpc&utm_campaignid=890&utm_adgroupid=&utm_adid=&utm_term=&utm_device=m&utm_network=x&utm_location=123&gclid=oqneoqow&gad_source=5&gclid=EAIaIQobChMI6MnvhciBjQMVlS-DAx',
        gclid: 'oqneoqow',
        mp_country_code: 'IN',
        mp_lib: 'web',
        mp_processing_time_ms: 1_746_078_175_546,
        mp_sent_by_lib_version: '2.60.0',
        utm_medium: 'cpc',
        utm_source: 'google',
      },
    };

    const res = provider.transformEvent(rawEvent);

    expect(res).toMatchObject({
      id: expect.any(String),
      name: 'screen_view',
      device_id: '123',
      profile_id: '123',
      project_id: 'pid',
      session_id: '',
      properties: {
        __source_insert_id: 'source_id',
        __screen: '384x854',
        __lib_version: '2.60.0',
        '__query.utm_source': 'google',
        '__query.utm_medium': 'cpc',
        '__query.utm_campaignid': '890',
        '__query.utm_device': 'm',
        '__query.utm_network': 'x',
        '__query.utm_location': '123',
        '__query.gclid': 'oqneoqow',
        __title:
          'Landeed: Satbara Utara, 7/12 Extract, Property Card & Index 2',
      },
      created_at: '2025-05-01 11:12:50',
      country: 'IN',
      city: 'Mumbai',
      region: 'Maharashtra',
      longitude: null,
      latitude: null,
      os: 'Android',
      os_version: undefined,
      browser: 'Chrome',
      browser_version: '135',
      device: 'mobile',
      brand: '',
      model: '',
      duration: 0,
      path: '/state/maharashtra',
      origin: 'https://domain.com',
      referrer: 'https://referrer.com',
      referrer_name: 'Google',
      referrer_type: 'search',
      imported_at: expect.any(String),
      sdk_name: 'mixpanel (web)',
      sdk_version: '1.0.0',
    });
  });

  it('should parse stringified JSON in properties and flatten them', async () => {
    const provider = new MixpanelProvider('pid', {
      from: '2025-01-01',
      to: '2025-01-02',
      serviceAccount: 'sa',
      serviceSecret: 'ss',
      projectId: '123',
      provider: 'mixpanel',
      type: 'api',
      mapScreenViewProperty: undefined,
    });

    const rawEvent = {
      event: 'custom_event',
      properties: {
        time: 1_746_097_970,
        distinct_id: '$device:123',
        $device_id: '123',
        $user_id: 'user123',
        mp_lib: 'web',
        // Stringified JSON object - should be parsed and flattened
        area: '{"displayText":"Malab, Nuh, Mewat","id":1189005}',
        // Stringified JSON array - should be parsed and flattened
        tags: '["tag1","tag2","tag3"]',
        // Regular string - should remain as is
        regularString: 'just a string',
        // Number - should be converted to string
        count: 42,
        // Object - should be flattened
        nested: { level1: { level2: 'value' } },
      },
    };

    const res = provider.transformEvent(rawEvent);

    expect(res.properties).toMatchObject({
      // Parsed JSON object should be flattened with dot notation
      'area.displayText': 'Malab, Nuh, Mewat',
      'area.id': '1189005',
      // Parsed JSON array should be flattened with numeric indices
      'tags.0': 'tag1',
      'tags.1': 'tag2',
      'tags.2': 'tag3',
      // Regular values
      regularString: 'just a string',
      count: '42',
      // Nested object flattened
      'nested.level1.level2': 'value',
    });
  });

  it('should handle react-native referrer', async () => {
    const provider = new MixpanelProvider('pid', {
      from: '2025-01-01',
      to: '2025-01-02',
      serviceAccount: 'sa',
      serviceSecret: 'ss',
      projectId: '123',
      provider: 'mixpanel',
      type: 'api',
      mapScreenViewProperty: undefined,
    });

    const rawEvent = {
      event: 'ec_search_error',
      properties: {
        time: 1_759_947_367,
        distinct_id: '3385916',
        $browser: 'Mobile Safari',
        $browser_version: null,
        $city: 'Bengaluru',
        $current_url:
          'https://web.landeed.com/karnataka/ec-encumbrance-certificate',
        $device: 'iPhone',
        $device_id:
          '199b498af1036c-0e943279a1292e-5c0f4368-51bf4-199b498af1036c',
        $initial_referrer: 'https://www.google.com/',
        $initial_referring_domain: 'www.google.com',
        $insert_id: 'bclkaepeqcfuzt4v',
        $lib_version: '2.60.0',
        $mp_api_endpoint: 'api-js.mixpanel.com',
        $mp_api_timestamp_ms: 1_759_927_570_699,
        $os: 'iOS',
        $region: 'Karnataka',
        $screen_height: 852,
        $screen_width: 393,
        $search_engine: 'google',
        $user_id: '3385916',
        binaryReadableVersion: 'NA',
        binaryVersion: 'NA',
        component: '/karnataka/ec-encumbrance-certificate',
        errMsg: 'Request failed with status code 500',
        errType: 'SERVER_ERROR',
        isSilentSearch: false,
        isTimeout: false,
        jsVersion: '0.42.0',
        language: 'english',
        mp_country_code: 'IN',
        mp_lib: 'web',
        mp_processing_time_ms: 1_759_927_592_421,
        mp_sent_by_lib_version: '2.60.0',
        os: 'web',
        osVersion:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/388.0.811331708 Mobile/15E148 Safari/604.1',
        phoneBrand: 'NA',
        phoneManufacturer: 'NA',
        phoneModel: 'NA',
        searchUuid: '68e65d08-fd81-4ded-37d3-2b08d2bc70c3',
        serverVersion: 'web2.0',
        state: 17,
        stateStr: '17',
        statusCode: 500,
        type: 'result_event',
        utm_medium: 'cpc',
        utm_source:
          'google%26utm_medium=cpc%26utm_campaignid=21380769590%26utm_adgroupid=%26utm_adid=%26utm_term=%26utm_device=m%26utm_network=%26utm_location=9062055%26gclid=%26gad_campaignid=21374496705%26gbraid=0AAAAAoV7mTM9mWFripzQ2Od0xXAfrW6p3%26wbraid=CmAKCQjwi4PHBhCUA',
      },
    };

    const res = provider.transformEvent(rawEvent);

    expect(res.id.length).toBeGreaterThan(30);
    expect(res.imported_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(omit(['id', 'imported_at'], res)).toEqual({
      brand: 'Apple',
      browser: 'GSA',
      browser_version: '388.0.811331708',
      city: 'Bengaluru',
      country: 'IN',
      created_at: '2025-10-08 18:16:07',
      device: 'mobile',
      device_id: '199b498af1036c-0e943279a1292e-5c0f4368-51bf4-199b498af1036c',
      duration: 0,
      latitude: null,
      longitude: null,
      model: 'iPhone',
      name: 'ec_search_error',
      origin: 'https://web.landeed.com',
      os: 'iOS',
      os_version: '18.7.0',
      path: '/karnataka/ec-encumbrance-certificate',
      profile_id: '3385916',
      project_id: 'pid',
      properties: {
        __lib_version: '2.60.0',
        '__query.gad_campaignid': '21374496705',
        '__query.gbraid': '0AAAAAoV7mTM9mWFripzQ2Od0xXAfrW6p3',
        '__query.utm_campaignid': '21380769590',
        '__query.utm_device': 'm',
        '__query.utm_location': '9062055',
        '__query.utm_medium': 'cpc',
        '__query.utm_source': 'google',
        '__query.wbraid': 'CmAKCQjwi4PHBhCUA',
        __screen: '393x852',
        __source_insert_id: 'bclkaepeqcfuzt4v',
        __userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/388.0.811331708 Mobile/15E148 Safari/604.1',
        binaryReadableVersion: 'NA',
        binaryVersion: 'NA',
        component: '/karnataka/ec-encumbrance-certificate',
        errMsg: 'Request failed with status code 500',
        errType: 'SERVER_ERROR',
        isSilentSearch: 'false',
        isTimeout: 'false',
        jsVersion: '0.42.0',
        language: 'english',
        os: 'web',
        osVersion:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/388.0.811331708 Mobile/15E148 Safari/604.1',
        phoneBrand: 'NA',
        phoneManufacturer: 'NA',
        phoneModel: 'NA',
        searchUuid: '68e65d08-fd81-4ded-37d3-2b08d2bc70c3',
        serverVersion: 'web2.0',
        state: '17',
        stateStr: '17',
        statusCode: '500',
        type: 'result_event',
      },
      referrer: 'https://www.google.com',
      referrer_name: 'Google',
      referrer_type: 'search',
      region: 'Karnataka',
      sdk_name: 'mixpanel (web)',
      sdk_version: '1.0.0',
      session_id: '',
      groups: [],
    });
  });

  it('should accept dataResidency config', () => {
    const base = {
      from: '2025-01-01',
      to: '2025-01-02',
      serviceAccount: 'sa',
      serviceSecret: 'ss',
      projectId: '123',
      provider: 'mixpanel' as const,
      type: 'api' as const,
    };

    // All valid values should construct without throwing
    expect(() => new MixpanelProvider('pid', { ...base, dataResidency: 'us' })).not.toThrow();
    expect(() => new MixpanelProvider('pid', { ...base, dataResidency: 'eu' })).not.toThrow();
    expect(() => new MixpanelProvider('pid', { ...base, dataResidency: 'in' })).not.toThrow();

    // Undefined defaults to 'us' without throwing
    expect(() => new MixpanelProvider('pid', { ...base })).not.toThrow();
  });

  describe('project timezone', () => {
    const providerFor = (timezone?: string) =>
      new MixpanelProvider('pid', {
        from: '2025-01-01',
        to: '2025-12-31',
        serviceAccount: 'sa',
        serviceSecret: 'ss',
        projectId: '123',
        provider: 'mixpanel',
        type: 'api',
        mapScreenViewProperty: undefined,
        timezone,
      });

    const eventAt = (time: number, timezone?: string) =>
      providerFor(timezone).transformEvent({
        event: 'custom_event',
        properties: { time, distinct_id: 'u1', $device_id: 'd1', mp_lib: 'web' },
      }).created_at;

    it('leaves timestamps alone when no timezone is configured', () => {
      expect(eventAt(1_746_097_970)).toBe('2025-05-01 11:12:50');
      expect(eventAt(1_746_097_970, 'UTC')).toBe('2025-05-01 11:12:50');
    });

    it('converts project-local event times to UTC', () => {
      // Asia/Riyadh is UTC+3 year round, no DST.
      expect(eventAt(1_746_097_970, 'Asia/Riyadh')).toBe('2025-05-01 08:12:50');
    });

    it('resolves the offset per instant, so DST is handled', () => {
      // Both are 12:00 on the project's wall clock. Europe/Stockholm is UTC+2
      // in July and UTC+1 in January, so they land an hour apart in UTC — a
      // fixed offset would get one of them wrong.
      expect(eventAt(1_751_371_200, 'Europe/Stockholm')).toBe(
        '2025-07-01 10:00:00'
      );
      expect(eventAt(1_735_732_800, 'Europe/Stockholm')).toBe(
        '2025-01-01 11:00:00'
      );
    });

    it('converts profile timestamps too', () => {
      const profile = providerFor('Asia/Riyadh').transformProfile({
        $distinct_id: 'u1',
        $properties: {
          $created: '2025-02-03T09:15:00',
          $last_seen: '2025-05-20T18:42:11',
        },
      });

      expect(profile.created_at).toBe('2025-02-03 06:15:00');
      expect(profile.last_seen_at).toBe('2025-05-20 15:42:11');
    });

    it('falls back to the raw timestamp on an unknown timezone', () => {
      expect(eventAt(1_746_097_970, 'Not/AZone')).toBe('2025-05-01 11:12:50');
    });
  });

  describe('transformProfile', () => {
    const makeProvider = () =>
      new MixpanelProvider('pid', {
        from: '2025-01-01',
        to: '2025-06-30',
        serviceAccount: 'sa',
        serviceSecret: 'ss',
        projectId: '123',
        provider: 'mixpanel',
        type: 'api',
        mapScreenViewProperty: undefined,
      });

    it('uses $created and $last_seen rather than the import wall clock', () => {
      const profile = makeProvider().transformProfile({
        $distinct_id: 'user-1',
        $properties: {
          $created: '2025-02-03T09:15:00',
          $last_seen: '2025-05-20T18:42:11',
          $email: 'a@example.com',
        },
      });

      expect(profile.created_at).toBe('2025-02-03 09:15:00');
      expect(profile.last_seen_at).toBe('2025-05-20 18:42:11');
      expect(profile.created_at).not.toBe(profile.last_seen_at);
    });

    it('falls back to $last_seen when $created is absent', () => {
      const profile = makeProvider().transformProfile({
        $distinct_id: 'user-2',
        $properties: { $last_seen: '2025-05-20T18:42:11' },
      });

      expect(profile.created_at).toBe('2025-05-20 18:42:11');
      expect(profile.last_seen_at).toBe('2025-05-20 18:42:11');
    });

    it('falls back to $created when $last_seen is absent', () => {
      const profile = makeProvider().transformProfile({
        $distinct_id: 'user-3',
        $properties: { $created: '2025-02-03T09:15:00' },
      });

      expect(profile.created_at).toBe('2025-02-03 09:15:00');
      expect(profile.last_seen_at).toBe('2025-02-03 09:15:00');
    });

    it('dates from the import window, never now, when both are absent', () => {
      const before = new Date();
      const profile = makeProvider().transformProfile({
        $distinct_id: 'user-4',
        $properties: { $email: 'b@example.com' },
      });

      expect(profile.created_at).toBe('2025-01-01 00:00:00');
      expect(profile.last_seen_at).toBe('2025-01-01 00:00:00');
      // The regression being guarded: import wall-clock time leaking in.
      expect(profile.created_at.startsWith(String(before.getFullYear()))).toBe(
        false
      );
    });

    it('ignores unparseable timestamps instead of writing Invalid Date', () => {
      const profile = makeProvider().transformProfile({
        $distinct_id: 'user-5',
        $properties: { $created: 'not-a-date', $last_seen: '' },
      });

      expect(profile.created_at).toBe('2025-01-01 00:00:00');
      expect(profile.last_seen_at).toBe('2025-01-01 00:00:00');
    });

    it('pins minute-precision timestamps to UTC too', () => {
      // Mixpanel doesn't always include seconds. Without matching this form,
      // it falls through to `new Date()` unmodified, which reads an
      // offset-free string as local time and makes the result depend on the
      // worker's TZ.
      const profile = makeProvider().transformProfile({
        $distinct_id: 'user-6',
        $properties: { $created: '2025-02-03T09:15', $last_seen: '2025-05-20 18:42' },
      });

      expect(profile.created_at).toBe('2025-02-03 09:15:00');
      expect(profile.last_seen_at).toBe('2025-05-20 18:42:00');
    });
  });

  describe('streamProfiles', () => {
    const makeProvider = () =>
      new MixpanelProvider('pid', {
        from: '2025-01-01',
        to: '2025-01-02',
        serviceAccount: 'sa',
        serviceSecret: 'ss',
        projectId: '123',
        provider: 'mixpanel',
        type: 'api',
        mapScreenViewProperty: undefined,
      });

    const engagePage = (
      body: Record<string, unknown>
    ): Response =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const profiles = (count: number, offset: number) =>
      Array.from({ length: count }, (_, i) => ({
        $distinct_id: `user-${offset + i}`,
        $properties: { $email: `user-${offset + i}@example.com` },
      }));

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('replays session_id on pages after the first', async () => {
      const bodies: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        bodies.push(String(init?.body));
        const page = bodies.length - 1;
        return Promise.resolve(
          engagePage({
            page,
            page_size: 5000,
            session_id: 'sess-abc',
            total: 7000,
            results: page === 0 ? profiles(5000, 0) : profiles(2000, 5000),
          })
        );
      });

      const provider = makeProvider();
      const seen: string[] = [];
      for await (const profile of provider.streamProfiles()) {
        seen.push(String(profile.$distinct_id));
      }

      expect(seen).toHaveLength(7000);
      expect(bodies).toHaveLength(2);

      const first = new URLSearchParams(bodies[0]);
      expect(first.get('page')).toBe('0');
      expect(first.get('session_id')).toBeNull();

      const second = new URLSearchParams(bodies[1]);
      expect(second.get('page')).toBe('1');
      expect(second.get('session_id')).toBe('sess-abc');
    });

    it('paginates on the page_size Mixpanel reports, not the one requested', async () => {
      const bodies: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        bodies.push(String(init?.body));
        const page = bodies.length - 1;
        return Promise.resolve(
          engagePage({
            page,
            // Mixpanel caps the page below the 5000 we ask for.
            page_size: 1000,
            session_id: 'sess-abc',
            total: 1500,
            results: page === 0 ? profiles(1000, 0) : profiles(500, 1000),
          })
        );
      });

      const provider = makeProvider();
      const seen: string[] = [];
      for await (const profile of provider.streamProfiles()) {
        seen.push(String(profile.$distinct_id));
      }

      expect(seen).toHaveLength(1500);
      expect(bodies).toHaveLength(2);
    });

    it('throws when a full page has neither session_id nor total', async () => {
      // With neither signal there is nothing to check completeness against --
      // silently stopping here would be indistinguishable from truncating a
      // genuinely incomplete import.
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          engagePage({
            page: 0,
            page_size: 5000,
            results: profiles(5000, 0),
          })
        )
      );

      const provider = makeProvider();
      const drain = async () => {
        for await (const _profile of provider.streamProfiles()) {
          // draining the generator
        }
      };

      await expect(drain()).rejects.toThrow(
        /without a session_id or total/
      );
    });

    it('throws instead of silently truncating when total shows more profiles remain', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          engagePage({
            page: 0,
            page_size: 5000,
            total: 7000,
            results: profiles(5000, 0),
          })
        )
      );

      const provider = makeProvider();
      const drain = async () => {
        for await (const _profile of provider.streamProfiles()) {
          // draining the generator
        }
      };

      await expect(drain()).rejects.toThrow(/2000 of 7000 profiles remain/);
    });

    it('does not throw when a full page coincidentally exhausts total', async () => {
      const bodies: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        bodies.push(String(init?.body));
        return Promise.resolve(
          engagePage({
            page: 0,
            page_size: 5000,
            total: 5000,
            results: profiles(5000, 0),
          })
        );
      });

      const provider = makeProvider();
      const seen: string[] = [];
      for await (const profile of provider.streamProfiles()) {
        seen.push(String(profile.$distinct_id));
      }

      expect(seen).toHaveLength(5000);
      expect(bodies).toHaveLength(1);
    });

    it('throws on a short page too when total shows more profiles remain', async () => {
      // Mixpanel documents page_size as a cap, not a guarantee -- a page
      // smaller than page_size is not necessarily the last one.
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          engagePage({
            page: 0,
            page_size: 5000,
            session_id: 'sess-abc',
            total: 7000,
            results: profiles(3000, 0),
          })
        )
      );

      const provider = makeProvider();
      const drain = async () => {
        for await (const _profile of provider.streamProfiles()) {
          // draining the generator
        }
      };

      await expect(drain()).rejects.toThrow(/4000 of 7000 profiles remain/);
    });

    it('does not keep paging with a stale session_id once a later page omits it', async () => {
      const bodies: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        bodies.push(String(init?.body));
        const page = bodies.length - 1;
        // Page 0 opens a session; page 1 is a full page that (for whatever
        // reason) comes back without one. `?? sessionId` would carry sess-abc
        // forward and request page 2 with an id Mixpanel no longer honours.
        return Promise.resolve(
          engagePage({
            page,
            page_size: 5000,
            session_id: page === 0 ? 'sess-abc' : undefined,
            total: 12_000,
            results: profiles(5000, page * 5000),
          })
        );
      });

      const provider = makeProvider();
      const drain = async () => {
        for await (const _profile of provider.streamProfiles()) {
          // draining the generator
        }
      };

      await expect(drain()).rejects.toThrow(/2000 of 12000 profiles remain/);
      expect(bodies).toHaveLength(2);
    });
  });
});
