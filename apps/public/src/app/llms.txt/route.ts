import {
  OPENPANEL_BASE_URL,
  OPENPANEL_DESCRIPTION,
  OPENPANEL_NAME,
} from '@/lib/openpanel-brand';

export const dynamic = 'force-static';

const body = `# ${OPENPANEL_NAME}

> ${OPENPANEL_DESCRIPTION}

## Main pages
- [Home](${OPENPANEL_BASE_URL}/)
- [Features](${OPENPANEL_BASE_URL}/features) (event tracking, funnels, retention, web analytics, and more)
- [Guides](${OPENPANEL_BASE_URL}/guides)
- [Articles](${OPENPANEL_BASE_URL}/articles)
- [Open source](${OPENPANEL_BASE_URL}/open-source)
- [Supporter](${OPENPANEL_BASE_URL}/supporter)
- [About](${OPENPANEL_BASE_URL}/about)
- [Contact](${OPENPANEL_BASE_URL}/contact)

## Core docs
- [What is OpenPanel?](${OPENPANEL_BASE_URL}/docs)
- [Install OpenPanel](${OPENPANEL_BASE_URL}/docs/get-started/install-openpanel)
- [Track Events](${OPENPANEL_BASE_URL}/docs/get-started/track-events)
- [Identify Users](${OPENPANEL_BASE_URL}/docs/get-started/identify-users)

## SDKs
- [SDKs Overview](${OPENPANEL_BASE_URL}/docs/sdks)
- [JavaScript](${OPENPANEL_BASE_URL}/docs/sdks/javascript)
- [React](${OPENPANEL_BASE_URL}/docs/sdks/react)
- [Next.js](${OPENPANEL_BASE_URL}/docs/sdks/nextjs)
- [Vue](${OPENPANEL_BASE_URL}/docs/sdks/vue)
- [React Native](${OPENPANEL_BASE_URL}/docs/sdks/react-native)
- [Swift](${OPENPANEL_BASE_URL}/docs/sdks/swift)
- [Kotlin](${OPENPANEL_BASE_URL}/docs/sdks/kotlin)
- [Python](${OPENPANEL_BASE_URL}/docs/sdks/python)

## API
- [Authentication](${OPENPANEL_BASE_URL}/docs/api/authentication)
- [Track API](${OPENPANEL_BASE_URL}/docs/api/track)
- [Export API](${OPENPANEL_BASE_URL}/docs/api/export)
- [Insights API](${OPENPANEL_BASE_URL}/docs/api/insights)

## Self-hosting
- [Self-hosting Guide](${OPENPANEL_BASE_URL}/docs/self-hosting/self-hosting)
- [Docker Compose](${OPENPANEL_BASE_URL}/docs/self-hosting/deploy-docker-compose)
- [Environment Variables](${OPENPANEL_BASE_URL}/docs/self-hosting/environment-variables)

## Pricing
- [Pricing](${OPENPANEL_BASE_URL}/pricing)

## Compare (alternatives)
- [Mixpanel alternative](${OPENPANEL_BASE_URL}/compare/mixpanel-alternative)
- [PostHog alternative](${OPENPANEL_BASE_URL}/compare/posthog-alternative)
- [Google Analytics alternative](${OPENPANEL_BASE_URL}/compare/google-analytics-alternative)
- [Amplitude alternative](${OPENPANEL_BASE_URL}/compare/amplitude-alternative)
- [Plausible alternative](${OPENPANEL_BASE_URL}/compare/plausible-alternative)
- [Umami alternative](${OPENPANEL_BASE_URL}/compare/umami-alternative)
- [Compare all](${OPENPANEL_BASE_URL}/compare)

## Trust & legal
- [Privacy Policy](${OPENPANEL_BASE_URL}/privacy)
- [Terms of Service](${OPENPANEL_BASE_URL}/terms)

## Source
- [GitHub](https://github.com/Openpanel-dev/openpanel)

## Optional
- [Full docs for LLMs](${OPENPANEL_BASE_URL}/llms-full.txt)
`;

export async function GET() {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
