<p align="center">
  <img src="images/mixan.svg">
</p>

# mixan

Mixan is a simple analytics tool for logging events on web and react-native. My goal is to make a minimal mixpanel copy with the most basic features (for now).

- Easy to use
- Fully responsive UI
- Own your own data
- GDPR friendly

## Whats left?

> Currently storing events on postgres but will probably move it to [clickhouse](https://clickhouse.com/) to speed up queries. Don't have any performance issues yet so will wait and see how well postgres can handle it.

### Speed/Benchmark

As of today (2023-12-12) I have more then 1.2 million events in PSQL and performance is smooth as butter 🧈. Only thing that is slow (2s response time) is to get all unique events. Solved now with cache but can probably make better with `indexes` and avoid using `distinct`.

### GUI

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
- [ ] Invite users
- [ ] Drag n Drop reports on dashboard
- [x] Manage dashboards
- [ ] Support more chart types
  - [x] Bar
  - [x] Histogram
  - [ ] Pie
  - [ ] Area
- [ ] Support funnels
- [ ] Support multiple breakdowns
- [x] Aggregations (sum, average...)

### SDK

- [x] Store duration on screen view events (can be done in backend as well)
- [x] Create native sdk
  - [x] Handle sessions
- [x] Create web sdk
  - [x] Screen view function should take in title, path and parse query string (especially utm tags)

## @mixan/sdk

For pushing events

### Install

- npm: `npm install @mixan/sdk`
- pnpm: `pnpm add @mixan/sdk`
- yarn: `yarn add @mixan/sdk`

### Usage

```ts
import { MixanWeb } from '@mixan/sdk-web';

// import { MixanNative } from '@mixan/sdk-native';

const mixan = new MixanWeb({
  clientId: 'uuid',
  url: 'http://localhost:8080/api/sdk',
  batchInterval: 10000,
  verbose: false,
  trackIp: true,
});

// const mixan = new MixanNative({
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
mixan.init();

// tracks all outgoing links as a `link_out` event
mixan.trackOutgoingLinks();

mixan.setUser({
  id: 'id',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@gmail.com',
  properties: {}, // any properties
});

// will upsert 'app_open' on user property and increment it
mixan.increment('app_open');
// will upsert 'app_open' on user property and increment it by 10
mixan.increment('app_open', 10);
// will upsert 'app_open' on user property and decrement it by 2
mixan.decrement('app_open', 2);

// send a sign_in event
mixan.event('sign_in');

// send a sign_in event with properties
mixan.event('sign_in', {
  provider: 'gmail',
});

// Screen view for web
mixan.screenView();

// Screen view for native
mixan.screenView('Article', {
  id: '3',
  title: 'Nice article here',
});

// Call this when a user is logged out.
// This will just make sure you do not send
// the associated profile id for the next events
mixan.clear();
```

## @mixan/web

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
