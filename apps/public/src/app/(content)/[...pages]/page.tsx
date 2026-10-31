import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { PageHero } from '@/components/page-hero';
import { Toc } from '@/components/toc';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { pageSource } from '@/lib/source';
import { cn } from '@/lib/utils';
import { getMDXComponents } from '@/mdx-components';

// These pages have their own route and only use the MDX for their text.
const DEDICATED_ROUTES = new Set(['about', 'contact']);

const LEGAL_PAGES = [
  { slug: 'privacy', name: 'Privacy policy' },
  { slug: 'terms', name: 'Terms of service' },
  { slug: 'cookies', name: 'Cookies' },
  { slug: 'dpa', name: 'Data processing agreement' },
];

const PROSE_CLASS =
  'prose max-w-none [&_h2]:scroll-mt-28 [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h3]:scroll-mt-28';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pages: string[] }>;
}): Promise<Metadata> {
  const { pages } = await params;
  const page = await pageSource.getPage(pages);

  if (!page) {
    return {
      title: 'Page Not Found',
    };
  }

  return getPageMetadata({
    title: page.data.title,
    url: url(page.url),
    description: page.data.description,
    image: getOgImageUrl(page.url),
  });
}

export async function generateStaticParams() {
  const pages = await pageSource.getPages();
  return pages
    .filter((page) => !DEDICATED_ROUTES.has(page.slugs.join('/')))
    .map((page) => ({
      pages: page.url.split('/').slice(1),
    }));
}

function LegalNav({ current }: { current: string }) {
  return (
    <nav aria-label="Legal" className="col gap-3 text-sm">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        Legal
      </span>
      <ul className="col gap-2">
        {LEGAL_PAGES.map((page) => (
          <li key={page.slug}>
            <Link
              className={cn(
                'transition-colors hover:text-neutral-900',
                page.slug === current
                  ? 'font-medium text-neutral-900'
                  : 'text-neutral-500'
              )}
              href={`/${page.slug}`}
            >
              {page.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ pages: string[] }>;
}) {
  const { pages } = await params;
  const page = await pageSource.getPage(pages);
  const Body = page?.data.body;

  if (!(page && Body)) {
    return notFound();
  }

  const slug = page.slugs.join('/');
  const isLegal = LEGAL_PAGES.some((legal) => legal.slug === slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.data.title,
    description: page.data.description,
    url: url(page.url),
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      logo: {
        '@type': 'ImageObject',
        url: url('/logo.png'),
      },
    },
  };

  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="page-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <PageHero
        align={isLegal ? 'left' : 'center'}
        className="pb-10 md:pb-12"
        description={page.data.description}
        title={page.data.title}
      />
      {isLegal ? (
        <div className="container grid grid-cols-1 gap-10 pb-24 md:grid-cols-[200px_minmax(0,1fr)] md:gap-14 md:pb-32">
          <aside className="hidden md:block">
            <div className="col sticky top-28 max-h-[calc(100vh-8rem)] gap-10 overflow-y-auto pb-8">
              <LegalNav current={slug} />
              <Toc toc={page.data.toc} />
            </div>
          </aside>
          <article className={cn('surface p-6 md:p-12', PROSE_CLASS)}>
            <Body components={getMDXComponents()} />
            <p className="mt-12 border-neutral-100 border-t pt-6 text-neutral-500 text-sm">
              Questions about this page? Email{' '}
              <a href="mailto:hello@openpanel.dev">hello@openpanel.dev</a>.
            </p>
          </article>
        </div>
      ) : (
        <div className="container pb-24 md:pb-32">
          <div className="mx-auto max-w-3xl">
            <article className={cn('surface p-6 md:p-12', PROSE_CLASS)}>
              <Body components={getMDXComponents()} />
            </article>
          </div>
        </div>
      )}
    </>
  );
}
