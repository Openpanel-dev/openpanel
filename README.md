# mixan

Mixan is a simple analytics tool for logging events on web and react-native. My goal is to make a minimal mixpanel copy with the most basic features (for now).

## @mixan/sdk

For pushing events

### Install

- npm: `npm install @mixan/sdk`
- pnpm: `pnpm add @mixan/sdk`
- yarn: `yarn add @mixan/sdk`

### Usage

```ts
import { Mixan } from '@mixan/sdk';

const mixan = new Mixan({
  clientSecret: '9fb405d2-7e16-489f-980c-67b25a6eab97',
  url: 'http://localhost:8080',
  batchInterval: 10000,
  verbose: false
})

mixan.setUser({
  id: 'id',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@gmail.com',
  properties: {} // any properties
})

// will upsert 'app_open' on user property and increment it
mixan.increment('app_open') 
// will upsert 'app_open' on user property and increment it by 10
mixan.increment('app_open', 10)
// will upsert 'app_open' on user property and decrement it by 2 
mixan.decrement('app_open', 2) 

// send a sign_in event 
mixan.event('sign_in')

// send a sign_in event with properties 
mixan.event('sign_in', {
  provider: 'gmail'
})

// short hand for 'screen_view', can also take any properties
mixan.screenView('Profile', {
  id: '123',
  // any other properties, url, public
})
```

## @mixan/backend

Self hosted service for collecting all events. Dockerfile and GUI will be added soon.