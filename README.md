# Openpanel

Openpanel is a simple analytics tool for logging events on web and react-native. My goal is to make a minimal mixpanel copy with the most basic features (for now).

- Easy to use
- Fully responsive UI
- Own your own data
- GDPR friendly

## Whats left?

> Currently storing events on postgres but will probably move it to [clickhouse](https://clickhouse.com/) to speed up queries. Don't have any performance issues yet so will wait and see how well postgres can handle it.

### Speed/Benchmark

As of today (~~2023-12-12~~ 2024-01-16) I have more then ~~1.2~~ 2.8 million events and 20 thousand profiles in postgres and performance is smooth as butter\* 🧈. Only thing that is slow (2s response time) is to get all unique events. Solved now with cache but can probably make better with `indexes` and avoid using `distinct`.

\* Smooth as butter is somewhat exaggerated but I would say it still fast! It takes 1.4 sec to search through all events (3 million) with advanced where clause. I think this performance is absolutly good enough.

### GUI

- [x] Fix design for report editor
- [x] Fix profiles
  - [x] Pagination
  - [x] Filter by event name
- [x] Fix [profileId]
  - [x] Add events
  - [x] Improve design for properties and linked profiles
- [x] New design for events
- [ ] Map events to convertions
- [ ] Map ids
- [x] Fix menu links when projectId is undefined
- [x] Fix tables on settings
- [x] Rename event label
- [ ] Common web dashboard
  - [x] User histogram (last 30 minutes)
  - [ ] Bounce rate
  - [ ] Session duration
  - [ ] Views per session
  - [ ] Unique users
  - [ ] Total users
  - [ ] Total pageviews
  - [ ] Total events
- [x] Save report to a specific dashboard
- [x] View events in a list
  - [x] Simple filters
- [x] View profiles in a list
- [x] Invite users
- [ ] Drag n Drop reports on dashboard
- [x] Manage dashboards
- [x] Support more chart types
  - [x] Bar
  - [x] Histogram
  - [x] Pie
  - [x] Area
  - [x] Metric
  - [x] Line
- [ ] Support funnels
- [ ] Support multiple breakdowns
- [x] Aggregations (sum, average...)

### SDK

- [x] Store duration on screen view events (can be done in backend as well)
- [x] Create native sdk
  - [x] Handle sessions
- [x] Create web sdk
  - [x] Screen view function should take in title, path and parse query string (especially utm tags)

## @openpanel/sdk

For pushing events

### Install

- npm: `npm install @openpanel/sdk`
- pnpm: `pnpm add @openpanel/sdk`
- yarn: `yarn add @openpanel/sdk`

### Usage

```ts
import { OpenpanelWeb } from '@openpanel/web';

// import { OpenpanelNative } from '@openpanel/sdk-native';

const openpanel = new OpenpanelWeb({
  clientId: 'uuid',
  url: 'http://localhost:8080/api/sdk',
  batchInterval: 10000,
  verbose: false,
  trackIp: true,
});

// const openpanel = new OpenpanelNative({
//   clientId: 'uuid',
//   clientSecret: 'uuid',
//   url: 'http://localhost:8080/api/sdk',
//   batchInterval: 10000,
//   verbose: false,
//   trackIp: true,
// });

// Call this before you send any events
// It will create a anonymous profile
// This profile will be merged if you call `setUser` in a later stage
openpanel.init();

// tracks all outgoing links as a `link_out` event
openpanel.trackOutgoingLinks();

openpanel.setUser({
  id: 'id',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@gmail.com',
  properties: {}, // any properties
});

// will upsert 'app_open' on user property and increment it
openpanel.increment('app_open');
// will upsert 'app_open' on user property and increment it by 10
openpanel.increment('app_open', 10);
// will upsert 'app_open' on user property and decrement it by 2
openpanel.decrement('app_open', 2);

// send a sign_in event
openpanel.event('sign_in');

// send a sign_in event with properties
openpanel.event('sign_in', {
  provider: 'gmail',
});

// Screen view for web
openpanel.screenView();

// Screen view for native
openpanel.screenView('Article', {
  id: '3',
  title: 'Nice article here',
});

// Call this when a user is logged out.
// This will just make sure you do not send
// the associated profile id for the next events
openpanel.clear();
```

## @openpanel/dashboard

A nextjs web app. Collects all events and your gui to analyze your data.

### Setup cronjobs (optional)

Use of cronjobs is optional. Everything will work without them but they will enhance the events with more data. We also use cronjobs to warm up the cache to make the user experiance a bit better.

We use https://cron-job.org (free) to handle our cronjobs, you can use any provider you want.

- **https://domain.com/api/cron/cache/update** Will update the memory cache
- **https://domain.com/api/cron/events/enrich** Enrich events (adds duration etc)

## Development

1. Run `docker-compose up -d` to get redis and postgres running
2. Then `pnpm dev` to boot the web and worker (queue)

## Screenshots

![Line chart](images/line.png)
![Bar chart](images/bar.png)
![Dashboard](images/dashboard.png)
![Settings](images/settings.png)
