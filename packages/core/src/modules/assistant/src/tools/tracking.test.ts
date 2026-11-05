import { describe, expect, test } from 'bun:test';
import { assessTracking, isProjectSite, type TrackingFacts } from './tracking';

const CLIENT = 'a6d8af68-dfdb-4794-baac-809f503fb7bf';

function facts(overrides: Partial<TrackingFacts> = {}): TrackingFacts {
  return {
    requestedUrl: 'https://acme.test',
    storedDomain: 'https://acme.test',
    pageOrigin: 'https://acme.test',
    fetch: { ok: true, status: 200, finalUrl: 'https://acme.test/' },
    snippet: {
      scriptTag: true,
      initCall: true,
      sdkPackage: false,
      clientIds: [CLIENT],
    },
    projectClients: [
      { id: CLIENT, name: 'Web', type: 'write', ignoreCorsAndSecret: false },
    ],
    foreignClients: [],
    cors: ['https://acme.test'],
    crossDomain: false,
    filters: { event: [], ip: 0, profile: 0 },
    firstEventAt: '2026-10-01T00:00:00.000Z',
    lastEventAt: '2026-10-19 12:00:00',
    recentByOrigin: [
      {
        origin: 'https://acme.test',
        count: 120,
        lastSeen: '2026-10-19 12:00:00',
      },
    ],
    ...overrides,
  };
}

const levels = (findings: ReturnType<typeof assessTracking>, check: string) =>
  findings
    .filter((finding) => finding.check === check)
    .map((finding) => finding.level);

describe('assessTracking', () => {
  test('a correct install is all green', () => {
    const findings = assessTracking(facts());
    expect(findings.every((finding) => finding.level === 'ok')).toBe(true);
  });

  test('a client id from another project is an error', () => {
    const findings = assessTracking(
      facts({
        snippet: {
          scriptTag: true,
          initCall: true,
          sdkPackage: false,
          clientIds: ['11111111-1111-4111-8111-111111111111'],
        },
        foreignClients: [
          { id: '11111111-1111-4111-8111-111111111111', projectId: 'other' },
        ],
      })
    );
    expect(levels(findings, 'clientId')).toEqual(['error']);
    expect(
      findings.find((finding) => finding.check === 'clientId')?.message
    ).toContain('another project');
  });

  test('a client id the user cannot place reads the same whether or not it exists', () => {
    const findings = assessTracking(
      facts({
        snippet: {
          scriptTag: true,
          initCall: true,
          sdkPackage: false,
          clientIds: ['11111111-1111-4111-8111-111111111111'],
        },
      })
    );
    const message = findings.find(
      (finding) => finding.check === 'clientId'
    )?.message;
    expect(levels(findings, 'clientId')).toEqual(['error']);
    expect(message).not.toContain('another project');
    expect(message).not.toContain('does not exist');
  });

  test('an origin outside the allowed list is an error, a wildcard is fine', () => {
    expect(
      levels(assessTracking(facts({ cors: ['https://other.test'] })), 'cors')
    ).toEqual(['error']);
    expect(levels(assessTracking(facts({ cors: ['*'] })), 'cors')).toEqual([
      'ok',
    ]);
    expect(levels(assessTracking(facts({ cors: [] })), 'cors')).toEqual([
      'error',
    ]);
  });

  test('a missing snippet is a warning, not an error', () => {
    const findings = assessTracking(
      facts({
        snippet: {
          scriptTag: false,
          initCall: false,
          sdkPackage: false,
          clientIds: [],
        },
      })
    );
    expect(levels(findings, 'snippet')).toEqual(['warn']);
  });

  test('traffic from other origins but not this one is called out', () => {
    const findings = assessTracking(
      facts({
        recentByOrigin: [
          { origin: 'https://staging.acme.test', count: 5, lastSeen: 'x' },
        ],
      })
    );
    const data = findings.find((finding) => finding.check === 'data');
    expect(data?.level).toBe('warn');
    expect(data?.message).toContain('staging.acme.test');
  });

  test('a project without any event ever is an error', () => {
    expect(
      levels(assessTracking(facts({ firstEventAt: null })), 'data')
    ).toEqual(['error']);
  });
});

describe('isProjectSite', () => {
  test("the project's own origin loads without asking, whatever the path", () => {
    expect(isProjectSite('https://acme.test', 'acme.test/pricing?x=1')).toBe(
      true
    );
  });

  test('any other address needs the user to confirm it', () => {
    expect(
      isProjectSite('https://acme.test', 'https://evil.test/?d=secret')
    ).toBe(false);
    expect(
      isProjectSite('https://acme.test', 'https://acme.test.evil.test')
    ).toBe(false);
    expect(isProjectSite(null, 'https://acme.test')).toBe(false);
  });
});
