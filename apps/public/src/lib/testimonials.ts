// Customer quotes shown on the homepage. Add a new one as another entry here;
// wrap the strongest sentence in ** ** to highlight it. Order is display order.
export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company?: { name: string; url: string };
  avatarUrl?: string;
  featured?: boolean;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "After paying a lot to PostHog for years, OpenPanel gives us the same, in many ways better, analytics while keeping full ownership of our data. **It's truly self-hosted but surprisingly low maintenance.** Setup and ongoing upkeep are straightforward, so we spend less time managing tooling and more time acting on insights. The support is fantastic. We honestly don't want to run any business without OpenPanel anymore.",
    author: 'Engineering team',
    role: 'Self-hosted, switched from PostHog',
    featured: true,
  },
  {
    quote:
      'After testing several product analytics tools for Strackr, **we chose OpenPanel and we are very satisfied with the product**. We have been using it since the beta, and there are constant updates. Profiles and conversion events are our favourite features.',
    author: 'Julien Hany',
    role: 'Founder',
    company: { name: 'Strackr', url: 'https://strackr.com' },
  },
  {
    quote:
      "Before OpenPanel I was using Plausible, and it was ok. **But OpenPanel is like 10 leagues ahead.** Better UX and UI, many more features, and incredible support from the founder. Bonus point: one-click install on Coolify. I won't switch to anything else.",
    author: 'Thomas Sanlis',
    role: 'Founder',
    company: { name: 'Uneed', url: 'https://uneed.best' },
    avatarUrl: '/twitter-thomas.jpg',
  },
  {
    quote:
      'The Overview tab has everything I need from my analytics: the stats, the graph, traffic sources, locations, devices. **The UI is beautiful.** Clean, modern look, very pleasing to the eye.',
    author: 'Piotr Kulpinski',
    role: 'Founder',
    company: { name: 'Kulpinski', url: 'https://kulpinski.pl' },
    avatarUrl: '/twitter-piotr.jpg',
  },
  {
    quote:
      'It combines the power of Mixpanel with the ease of use of Plausible into a fully open-source product.',
    author: 'Steven Tey',
    role: 'Founder',
    company: { name: 'Dub', url: 'https://dub.co' },
    avatarUrl: '/twitter-steven.jpg',
  },
  {
    quote:
      'Integrated OpenPanel last night, and now I can see visitors coming from all around the world. **More beautiful UI and much more powerful than Umami.**',
    author: 'Jacob',
    role: 'Indie hacker',
    avatarUrl: '/twitter-jacob.jpg',
  },
];
