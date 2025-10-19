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
        time: 1746097970,
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
        $mp_api_timestamp_ms: 1746078175363,
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
        mp_processing_time_ms: 1746078175546,
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
      created_at: '2025-05-01T11:12:50.000Z',
      country: 'IN',
      city: 'Mumbai',
      region: 'Maharashtra',
      longitude: null,
      latitude: null,
      os: 'Android',
      os_version: undefined,
      browser: 'Chrome',
      browser_version: '',
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
      sdk_name: 'mixpanel',
      sdk_version: '1.0.0',
    });
  });
});
