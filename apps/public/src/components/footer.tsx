import { MailIcon } from 'lucide-react';
import Link from 'next/link';
import { Logo } from './logo';
import { TOOLS } from '@/app/tools/tools';
import { getAllForSlugs, getForData } from '@/lib/for';
import { articleSource, compareSource, featureSource } from '@/lib/source';

// The comparisons most visitors look for; the rest are one click away on
// /compare. Short labels, so nothing truncates in the column.
const FOOTER_COMPARE: { slug: string; label: string }[] = [
  { slug: 'posthog-alternative', label: 'PostHog' },
  { slug: 'plausible-alternative', label: 'Plausible' },
  { slug: 'mixpanel-alternative', label: 'Mixpanel' },
  { slug: 'google-analytics-alternative', label: 'Google Analytics' },
  { slug: 'amplitude-alternative', label: 'Amplitude' },
  { slug: 'umami-alternative', label: 'Umami' },
  { slug: 'matomo-alternative', label: 'Matomo' },
];

const LATEST_ARTICLES = 8;

interface FooterLink {
  title: string;
  url: string;
}

export async function Footer() {
  const articles = (await articleSource.getPages()).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime()
  );
  const forSlugs = await getAllForSlugs();
  const forPages = (
    await Promise.all(forSlugs.map((slug) => getForData(slug)))
  ).filter((page): page is NonNullable<typeof page> => page !== null);
  const year = new Date().getFullYear();

  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: 'Product',
      links: [
        { title: 'All features', url: '/features' },
        ...featureSource.map((item) => ({
          title: item.short_name,
          url: item.url,
        })),
        { title: 'Pricing', url: '/pricing' },
      ],
    },
    {
      title: 'Solutions',
      links: [
        { title: 'All use cases', url: '/for' },
        ...forPages.map((page) => ({
          title: page.hero.heading,
          url: page.url,
        })),
        {
          title: 'Free analytics for open source',
          url: '/open-source',
        },
      ],
    },
    {
      title: 'Compare',
      links: [
        ...FOOTER_COMPARE.flatMap(({ slug, label }) => {
          const item = compareSource.find((entry) => entry.slug === slug);
          return item ? [{ title: label, url: item.url }] : [];
        }),
        { title: 'All comparisons', url: '/compare' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { title: 'Documentation', url: '/docs' },
        { title: 'SDKs', url: '/docs/sdks' },
        { title: 'Self-hosting', url: '/docs/self-hosting/self-hosting' },
        { title: 'Guides', url: '/guides' },
        { title: 'Articles', url: '/articles' },
        ...TOOLS.map((tool) => ({ title: tool.name, url: tool.url })),
        {
          title: 'Open source analytics',
          url: '/articles/self-hosted-web-analytics',
        },
      ],
    },
    {
      title: 'Latest articles',
      links: articles.slice(0, LATEST_ARTICLES).map((article) => ({
        title: article.data.title,
        url: article.url,
      })),
    },
  ];

  return (
    <footer className="border-neutral-200 border-t bg-canvas text-sm">
      <div className="col container gap-14 py-16 md:py-20">
        <div className="col md:row gap-8 md:items-start md:justify-between">
          <div className="col max-w-xs gap-4">
            <Link className="row items-center gap-2 font-medium" href="/">
              <Logo className="h-5 w-auto" />
              OpenPanel
            </Link>
            <p className="text-neutral-500 leading-relaxed">
              Open-source web, product and AI analytics. Built in Sweden, hosted
              in the EU, or wherever you run Docker.
            </p>
            <Social />
          </div>
          <div className="col gap-3 md:items-end">
            <a
              className="block w-[220px] overflow-hidden rounded-lg"
              href="https://openpanel.dev"
            >
              <iframe
                className="pointer-events-none border-0"
                height="48"
                src="https://dashboard.openpanel.dev/widget/badge?shareId=ancygl&color=%230B0B0B"
                title="OpenPanel Analytics Badge"
                width="220"
              />
            </a>
            <a
              className="row w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-neutral-600 text-xs ring-1 ring-black/6"
              href="https://status.openpanel.dev"
              rel="noreferrer noopener nofollow"
              target="_blank"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              All systems operational
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {columns.map((column) => (
            <div className="col gap-3" key={column.title}>
              <h3 className="font-medium text-neutral-900">{column.title}</h3>
              <ul className="col gap-2 text-neutral-500">
                {column.links.map((link) => (
                  <li className="truncate" key={link.url}>
                    <Link
                      className="transition-colors hover:text-neutral-900"
                      href={link.url}
                      title={link.title}
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="col md:row gap-4 border-neutral-200 border-t pt-8 text-neutral-500 text-xs md:items-center md:justify-between">
          <span>© {year} OpenPanel. All rights reserved.</span>
          <div className="row flex-wrap gap-x-5 gap-y-2">
            <Link className="hover:text-neutral-900" href="/about">
              About
            </Link>
            <Link className="hover:text-neutral-900" href="/contact">
              Contact
            </Link>
            <Link className="hover:text-neutral-900" href="/supporter">
              Become a supporter
            </Link>
            <Link className="hover:text-neutral-900" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-neutral-900" href="/terms">
              Terms
            </Link>
            <Link className="hover:text-neutral-900" href="/dpa">
              DPA
            </Link>
            <Link className="hover:text-neutral-900" href="/cookies">
              Cookies (just kidding)
            </Link>
            <Link className="hover:text-neutral-900" href="/sitemap.xml">
              Sitemap
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Social() {
  return (
    <div className="row gap-3 text-neutral-500 [&_a:hover]:text-neutral-900 [&_a]:transition-colors [&_svg]:size-5">
      <Link
        href="https://github.com/Openpanel-dev/openpanel"
        rel="noreferrer noopener nofollow"
        title="GitHub"
      >
        <svg className="fill-current" role="img" viewBox="0 0 24 24">
          <title>GitHub</title>
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
      </Link>
      <Link
        href="https://x.com/openpaneldev"
        rel="noreferrer noopener nofollow"
        title="X"
      >
        <svg className="fill-current" role="img" viewBox="0 0 24 24">
          <title>X</title>
          <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H3.298Z" />
        </svg>
      </Link>
      <Link
        href="https://go.openpanel.dev/discord"
        rel="noreferrer noopener nofollow"
        title="Discord"
      >
        <svg className="fill-current" role="img" viewBox="0 0 24 24">
          <title>Discord</title>
          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
        </svg>
      </Link>
      <Link
        href="mailto:hello@openpanel.dev"
        rel="noreferrer noopener nofollow"
        title="Email"
      >
        <MailIcon />
      </Link>
    </div>
  );
}
