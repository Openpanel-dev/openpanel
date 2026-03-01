import { omit } from 'ramda';
import { describe, expect, it } from 'vitest';
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
    });
  });
});
