const text =
  'Now I want you to create a new comparison, we should compare OpenPanel to %s. Do a deep research of %s and then create our structured json output with your result.';

const competitors = [
  // Top-tier mainstream analytics (very high popularity / broad usage)
  'Google Analytics', // GA4 is still the most widely used web analytics tool worldwide :contentReference[oaicite:1]{index=1}
  'Mixpanel', // Widely used for product/event analytics, large customer base and market share :contentReference[oaicite:2]{index=2}
  'Amplitude', // Frequently shows up among top product analytics tools in 2025 rankings :contentReference[oaicite:3]{index=3}
  // Well-established alternatives (recognized, used by many, good balance of features/privacy/hosting)
  'Matomo', // Open-source, powers 1M+ websites globally — leading ethical/self-hosted alternative :contentReference[oaicite:4]{index=4}
  'PostHog', // Rising in popularity as a GA4 alternative with both web & product analytics, event-based tracking, self-hostable :contentReference[oaicite:5]{index=5}
  'Heap', // Known in analytics rankings among top tools, often offers flexible event & session analytics :contentReference[oaicite:6]{index=6}

  // Privacy-first / open-source or self-hosted lightweight solutions (gaining traction, niche but relevant)
  'Plausible', // Frequently recommended as lightweight, GDPR-friendly, privacy-aware analytics alternative :contentReference[oaicite:7]{index=7}
  'Fathom Analytics', // Another privacy-centric alternative often listed among top GA-alternatives :contentReference[oaicite:8]{index=8}
  'Umami', // Lightweight open-source analytics; listed among top self-hosted / privacy-aware tools in 2025 reviews :contentReference[oaicite:9]{index=9}
  'Kissmetrics', // Long-time product/behaviour analytics tool, still appears in “top analytics tools” listings :contentReference[oaicite:10]{index=10}
  'Hotjar', // Popular for heatmaps / session recordings / user behavior insights — often used alongside analytics for qualitative data :contentReference[oaicite:11]{index=11}
  // More niche, specialized or less widely adopted (but still valid alternatives / complements)
  'Simple Analytics',
  'GoatCounter',
  'Pirsch Analytics',
  'Cabin Analytics',
  'Ackee',
  'FullStory',
  'LogRocket',
  'Adobe Analytics', // Enterprise-grade, deep integration — strong reputation but more expensive and targeted at larger orgs :contentReference[oaicite:12]{index=12},
  'Countly',
  'Appsflyer',
  'Adjust',
  'Smartlook',
  'Mouseflow',
  'Crazy Egg',
  'Microsoft Clarity',
];

for (const competitor of competitors) {
  console.log('--------------------------------');
  console.log(text.replaceAll('%s', competitor));
}
