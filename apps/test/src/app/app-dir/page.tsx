import { OpenpanelProvider, SetProfileId, trackEvent } from '@mixan-test/next';
import { Mixan as Openpanel } from '@mixan-test/sdk';

const opServer = new Openpanel({
  clientId: '4c9a28cb-73c3-429f-beaf-4b3fe91352ea',
  clientSecret: '2701ada9-fcbf-414a-ac94-9511949ee44d',
  url: 'https://api.openpanel.dev',
});

export default function Page() {
  // Track event in server actions
  async function create() {
    'use server';
    opServer.event('some-event', {
      profileId: '1234',
    });
  }

  return (
    <div>
      {/* In layout.tsx (app dir) or _app.tsx (pages) */}
      <OpenpanelProvider
        clientId="0acce97f-1126-4439-b7ee-5d384e2fc94b"
        url="https://api.openpanel.dev"
        trackScreenViews
        trackAttributes
        trackOutgoingLinks
      />

      {/* Provide user id in React Server Components */}
      <SetProfileId value="1234" />

      <button
        onClick={() =>
          trackEvent('some-event', {
            bar: 'bar',
            foo: 'foo',
            revenue: 1000,
          })
        }
      >
        Track event with method
      </button>

      <button
        data-event="some-event"
        data-bar="bar"
        data-foo="foo"
        data-revenue="1000"
      >
        Track event with attributes
      </button>
    </div>
  );
}
