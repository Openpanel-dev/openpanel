#!/usr/bin/env node
// Seed the local OpenPanel instance with fake profiles + events so we can
// verify the dashboard fixes against realistic-looking data.
//
// Usage:
//   node scripts/seed-local.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// Both come from the dashboard's onboarding screen ("Connect data").

const [, , CLIENT_ID, CLIENT_SECRET] = process.argv;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Usage: node scripts/seed-local.mjs <CLIENT_ID> <CLIENT_SECRET>',
  );
  process.exit(1);
}

const API_URL = process.env.API_URL || 'http://localhost:3333';
const PROFILE_COUNT = 220; // > 100 so we exceed two pages with pageSize=50
const headers = {
  'Content-Type': 'application/json',
  'openpanel-client-id': CLIENT_ID,
  'openpanel-client-secret': CLIENT_SECRET,
  // pretending to be a browser SDK so device/session creation works
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  origin: 'http://localhost:3000',
  referer: 'http://localhost:3000/',
};

const FIRST_NAMES = [
  'Justin', 'Rakevet', 'Monika', 'Matthew', 'Val', 'Andy', 'Sara', 'Tom',
  'Priya', 'Lin', 'Olu', 'Kenji', 'Maeve', 'Hugo', 'Ada', 'Noor', 'Diego',
  'Nia', 'Bram', 'Eline',
];
const LAST_NAMES = [
  'Davies', 'Cohen', 'Patel', 'Nguyen', 'Olsson', 'Smith', 'Garcia', 'Singh',
  'Tanaka', 'Mensah', 'Rossi', 'Schmidt', 'Lee', 'Andersen', 'Costa',
];
const COUNTRIES = [
  ['US', 'New York'],
  ['US', 'Redmond'],
  ['US', 'Orlando'],
  ['GB', 'Durham'],
  ['GB', 'West Bromwich'],
  ['GB', 'London'],
  ['IL', 'Tel Aviv'],
  ['DE', 'Berlin'],
  ['NL', 'Amsterdam'],
  ['SE', 'Stockholm'],
  ['BR', 'São Paulo'],
  ['IN', 'Bangalore'],
  ['JP', 'Tokyo'],
];
// Profile of clients that can send events. The Platforms card uses the
// `sdk_name` header to group sessions — mix these so some seeded users
// are web-only, some app-only, and a chunk use both.
const CLIENTS = [
  {
    id: 'web',
    sdkName: 'web',
    sdkVersion: '1.3.2',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    appVersion: null,
    buildNumber: null,
    os: 'macOS',
  },
  {
    id: 'ios',
    sdkName: 'op-ios',
    sdkVersion: '0.8.1',
    userAgent: 'PinDrop/4.12.0 CFNetwork/1490 Darwin/23.1.0',
    appVersion: '4.12.0',
    buildNumber: '4120',
    os: 'iOS',
  },
  {
    id: 'android',
    sdkName: 'op-android',
    sdkVersion: '0.7.4',
    userAgent:
      'PinDrop/4.11.2 (Linux; Android 14; Pixel 8) okhttp/4.12.0',
    appVersion: '4.11.2',
    buildNumber: '4112',
    os: 'Android',
  },
];

const REFERRERS = [
  // search engines with keywords (used by the search-keyword feature later)
  'https://www.google.com/search?q=pin+drop+app',
  'https://www.google.com/search?q=share+location+iphone',
  'https://www.bing.com/search?q=pindrop+meeting+place',
  'https://duckduckgo.com/?q=pin+drop+restaurants',
  // direct referrers
  'https://twitter.com/somebody/status/123',
  'https://news.ycombinator.com/item?id=1234',
  'https://producthunt.com/posts/pin-drop',
  '', // direct
  '', // direct
];
const PATHS = ['/', '/pricing', '/about', '/blog/launch', '/map', '/teams'];
const OS = ['Mac OS', 'Windows', 'iOS', 'Android'];
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge'];
const DEVICES = ['desktop', 'mobile', 'tablet'];

const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

let sent = 0;
let failed = 0;

async function postEvent(body, client = CLIENTS[0]) {
  const res = await fetch(`${API_URL}/track`, {
    method: 'POST',
    headers: {
      ...headers,
      'user-agent': client.userAgent,
      // The API's `validateSdkRequest` keys off these headers to stamp
      // `sdk_name` / `sdk_version` onto the event, which the Platforms
      // card groups by.
      'openpanel-sdk-name': client.sdkName,
      'openpanel-sdk-version': client.sdkVersion,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    failed++;
    if (failed <= 3) {
      console.error(`  ✗ ${res.status} ${await res.text()}`);
    }
    return;
  }
  sent++;
  if (sent % 250 === 0) {
    process.stdout.write(`  …${sent} events sent\n`);
  }
}

/** Pick a per-event client based on the profile's usage pattern. */
function clientFor(patternId) {
  if (patternId === 'web-only') return CLIENTS[0];
  if (patternId === 'ios-only') return CLIENTS[1];
  if (patternId === 'android-only') return CLIENTS[2];
  // Multi-platform users: weight so `primary` ~60%, secondary ~30%, tertiary ~10%.
  const r = Math.random();
  if (patternId === 'web-and-ios') {
    return r < 0.6 ? CLIENTS[0] : CLIENTS[1];
  }
  if (patternId === 'web-and-android') {
    return r < 0.6 ? CLIENTS[0] : CLIENTS[2];
  }
  if (patternId === 'all-three') {
    return r < 0.5 ? CLIENTS[0] : r < 0.8 ? CLIENTS[1] : CLIENTS[2];
  }
  return CLIENTS[0];
}

// Fake teams. In a real Pin Drop setup these would flow in from
// Stripe / RevenueCat webhooks as `group` events with type='team';
// here we just upsert them the same way an integration would.
// Pin Drop's four SKUs. Member-count rules per SKU:
//   - solo:     exactly 1 member (individual customer)
//   - team:     2-15 members
//   - team+:    5+ members
//   - team-pro: 5+ members (enterprise tier)
// The `size` here is the sales-record seat count; actual membership
// is driven by `assign_group` below and will approximate this.
const TEAMS = [
  // team-pro (5+, typically large enterprise)
  { id: 'team-acme', name: 'Acme Travel Co', plan: 'team-pro', size: 48 },
  { id: 'team-umbrella', name: 'Umbrella Holdings', plan: 'team-pro', size: 94 },
  { id: 'team-stark', name: 'Stark Industries', plan: 'team-pro', size: 22 },
  { id: 'team-hooli', name: 'Hooli', plan: 'team-pro', size: 68 },
  { id: 'team-wayne', name: 'Wayne Enterprises', plan: 'team-pro', size: 41 },

  // team-plus (5+)
  { id: 'team-initech', name: 'Initech', plan: 'team-plus', size: 7 },
  { id: 'team-massive-dynamic', name: 'Massive Dynamic', plan: 'team-plus', size: 15 },
  { id: 'team-cyberdyne', name: 'Cyberdyne Systems', plan: 'team-plus', size: 19 },

  // team (2-15)
  { id: 'team-globex', name: 'Globex', plan: 'team', size: 12 },
  { id: 'team-pied-piper', name: 'Pied Piper', plan: 'team', size: 5 },
  { id: 'team-paper-street', name: 'Paper Street Soap Co', plan: 'team', size: 3 },
  { id: 'team-vandelay', name: 'Vandelay Industries', plan: 'team', size: 4 },

  // solo (exactly 1 member per group — individual paying customer)
  { id: 'solo-nomad-travel', name: 'Nomad Travel (Solo)', plan: 'solo', size: 1 },
  { id: 'solo-maeve-tours', name: "Maeve's Tours (Solo)", plan: 'solo', size: 1 },
  { id: 'solo-diego-photo', name: 'Diego Photo (Solo)', plan: 'solo', size: 1 },
  { id: 'solo-hugo-maps', name: 'Hugo Maps (Solo)', plan: 'solo', size: 1 },
  { id: 'solo-lin-guides', name: 'Lin Guides (Solo)', plan: 'solo', size: 1 },
];

/** Split into buckets the assignment logic below uses. */
const SOLO_GROUPS = TEAMS.filter((t) => t.plan === 'solo');
const MULTI_MEMBER_GROUPS = TEAMS.filter((t) => t.plan !== 'solo');

// Helpers to give each seeded team realistic-looking commercial data.
const OWNERS = [
  'Andy Smith',
  'Rakevet Cohen',
  'Hugo Lee',
  'Maeve Rossi',
  'Diego Costa',
  'Lin Tanaka',
  'Sara Mensah',
  'Priya Patel',
  'Olu Ade',
  'Noor Hassan',
];
const TERMS = ['monthly', 'annual', '24m'];
const PLAN_BASE_ANNUAL = {
  solo: 96,
  team: 240,
  'team-plus': 720,
  'team-pro': 1800,
};

function dealAmountFor(plan, size, term) {
  const perSeat = PLAN_BASE_ANNUAL[plan] ?? 100;
  const multiplier = term === '24m' ? 2 : term === 'annual' ? 1 : 1 / 12;
  return Math.round(perSeat * size * multiplier);
}

function renewalFor(term) {
  const now = new Date();
  const add = term === 'monthly' ? 30 : term === 'annual' ? 365 : 730;
  const d = new Date(now.getTime() + add * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function seedGroups() {
  for (let i = 0; i < TEAMS.length; i++) {
    const team = TEAMS[i];
    const term = team.plan === 'solo' ? 'monthly' : choice(TERMS);
    await postEvent({
      type: 'group',
      payload: {
        id: team.id,
        type: 'team',
        name: team.name,
        properties: {
          plan: team.plan,
          member_count: team.size,
          owner_name: OWNERS[i % OWNERS.length],
          subscription_term: term,
          deal_amount: dealAmountFor(team.plan, team.size, term),
          currency: 'USD',
          renewal_date: renewalFor(term),
          stripe_customer_id: `cus_${team.id.replace(/[^a-z0-9]/gi, '').slice(-12)}`,
        },
      },
    });
  }
}

const USAGE_PATTERNS = [
  'web-only',
  'web-only',
  'web-only',
  'ios-only',
  'android-only',
  'web-and-ios',
  'web-and-ios',
  'web-and-android',
  'all-three',
];
function pickUsagePattern() {
  return USAGE_PATTERNS[Math.floor(Math.random() * USAGE_PATTERNS.length)];
}

async function seedProfile(i) {
  const firstName = choice(FIRST_NAMES);
  const lastName = choice(LAST_NAMES);
  const profileId = `seed-${i.toString().padStart(4, '0')}`;
  const [country, city] = choice(COUNTRIES);
  const browser = choice(BROWSERS);
  const device = choice(DEVICES);
  const pattern = pickUsagePattern();
  // Power-user distribution: most have 1-30 events, a few have 200-600.
  const eventCount = i < 15 ? randInt(200, 600) : randInt(1, 30);
  const isSubscriber = Math.random() < 0.25;

  // identify — send with the first client so the initial os/device
  // doesn't bias the platforms card.
  const identifyClient = clientFor(pattern);
  await postEvent(
    {
      type: 'identify',
      payload: {
        profileId,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}+${i}@example.com`,
        properties: {
          country,
          city,
          os: identifyClient.os,
          browser,
          device,
          is_subscriber: isSubscriber,
          plan: isSubscriber
            ? choice(['team', 'team-plus', 'team-pro'])
            : 'solo',
          timezone: choice([
            'Europe/London',
            'Europe/Amsterdam',
            'America/New_York',
            'America/Los_Angeles',
            'Asia/Tokyo',
          ]),
          locale: choice(['en-GB', 'en-US', 'de-DE', 'fr-FR', 'ja-JP']),
        },
      },
    },
    identifyClient,
  );

  // Group assignment rules:
  //   • Solo groups must have exactly 1 member — the first seeded
  //     profiles claim a solo slot each, in order, until all solos
  //     are filled. This guarantees we have real "solo customer" data
  //     to look at.
  //   • The rest of the subscriber profiles are distributed across
  //     team / team-plus / team-pro groups roughly in proportion to
  //     each group's declared `size`, so the member counts in the
  //     Groups table look like realistic sales-record ratios.
  //   • Non-subscribers (free/solo-plan profiles) stay ungrouped so
  //     the Anonymous / unassigned cohort isn't empty.
  let assignedTeamId = null;
  if (isSubscriber) {
    if (i < SOLO_GROUPS.length) {
      // One-to-one mapping into a solo group.
      assignedTeamId = SOLO_GROUPS[i].id;
    } else {
      // Weighted pick across multi-member groups so an enterprise
      // team (size=94) gets ~20× more members than a small one (size=5).
      const totalSize = MULTI_MEMBER_GROUPS.reduce(
        (acc, t) => acc + t.size,
        0,
      );
      let pick = Math.random() * totalSize;
      for (const team of MULTI_MEMBER_GROUPS) {
        pick -= team.size;
        if (pick <= 0) {
          assignedTeamId = team.id;
          break;
        }
      }
    }
    if (assignedTeamId) {
      await postEvent(
        {
          type: 'assign_group',
          payload: {
            groupIds: [assignedTeamId],
            profileId,
          },
        },
        identifyClient,
      );
    }
  }

  // events spread across the seeded profile's usage pattern
  for (let e = 0; e < eventCount; e++) {
    const referrer = choice(REFERRERS);
    const client = clientFor(pattern);
    await postEvent(
      {
        type: 'track',
        payload: {
          name: 'screen_view',
          profileId,
          // Stamp the team on every event so the Groups page's
          // aggregations (member count, last-active, events by team,
          // etc. — all of which read from events.groups) have data to
          // work with. In a real setup you'd pass this from the SDK
          // when you know the user is acting in a team context.
          ...(assignedTeamId ? { groups: [assignedTeamId] } : {}),
          properties: {
            path: choice(PATHS),
            referrer,
            __referrer: referrer,
            __query: referrer.includes('?')
              ? Object.fromEntries(new URL(referrer).searchParams.entries())
              : {},
            country,
            city,
            os: client.os,
            browser: client.id === 'web' ? browser : '',
            device,
            ...(client.appVersion
              ? {
                  __version: client.appVersion,
                  __buildNumber: client.buildNumber,
                }
              : {}),
          },
        },
      },
      client,
    );
  }

  // a few revenue events for some users
  if (isSubscriber && Math.random() < 0.5) {
    await postEvent({
      type: 'track',
      payload: {
        name: 'revenue',
        profileId,
        properties: {
          __revenue: randInt(900, 9900), // cents
          plan: 'pro',
        },
      },
    });
  }
}

async function main() {
  console.log(
    `Seeding ${PROFILE_COUNT} profiles into ${API_URL} (client ${CLIENT_ID.slice(0, 8)}…)`,
  );

  // Seed the teams (groups) first so profile `assign_group` calls can
  // reference them. In a real integration this is what a Stripe /
  // RevenueCat webhook handler would do on customer create/update.
  await seedGroups();
  console.log(`Seeded ${TEAMS.length} teams.`);

  // Run in small parallel batches so we don't melt the local API.
  const concurrency = 4;
  for (let i = 0; i < PROFILE_COUNT; i += concurrency) {
    await Promise.all(
      Array.from({ length: concurrency }, (_, k) =>
        i + k < PROFILE_COUNT ? seedProfile(i + k) : null,
      ).filter(Boolean),
    );
    process.stdout.write(`Profiles ${i + concurrency}/${PROFILE_COUNT}\r`);
  }
  console.log(`\nDone. ${sent} events sent, ${failed} failed.`);
  console.log(
    'Open http://localhost:3000 → Profiles / Groups.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
