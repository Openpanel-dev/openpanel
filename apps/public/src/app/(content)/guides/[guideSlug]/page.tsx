import { ArrowLeftIcon, ClockIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { FeatureCardContainer } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { GuideCard } from '@/components/guide-card';
import { Logo } from '@/components/logo';
import { SectionHeader } from '@/components/section';
import { Toc } from '@/components/toc';
import { getAuthor, url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { guideSource } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

const difficultyColors = {
  beginner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  intermediate:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const difficultyLabels = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export async function generateStaticParams() {
  const guides = await guideSource.getPages();
  return guides.map((guide) => {
    // Extract slug from URL (e.g., '/guides/my-guide' -> 'my-guide')
    const slug = guide.url.replace(/^\/guides\//, '').replace(/\/$/, '');
    return { guideSlug: slug };
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ guideSlug: string }>;
}): Promise<Metadata> {
  const { guideSlug } = await params;
  const guide = await guideSource.getPage([guideSlug]);

  if (!guide) {
    return {
      title: 'Guide Not Found',
    };
  }

  return getPageMetadata({
    title: guide.data.title,
    description: guide.data.description,
    url: url(guide.url),
    image: getOgImageUrl(guide.url),
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ guideSlug: string }>;
}) {
  const { guideSlug } = await params;
  const guide = await guideSource.getPage([guideSlug]);
  const Body = guide?.data.body;
  const author = getAuthor(guide?.data.team);
  const goBackUrl = '/guides';

  const relatedGuides = (await guideSource.getPages())
    .filter(
      (item) =>
        item.data.difficulty === guide?.data.difficulty &&
        item.url !== guide?.url
    )
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .slice(0, 3);

  if (!Body) {
    return notFound();
  }

  const slug = guide.url.replace(/^\/guides\//, '').replace(/\/$/, '');

  // Create the HowTo JSON-LD schema
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: guide?.data.title,
    description: guide?.data.description,
    totalTime: `PT${guide?.data.timeToComplete}M`,
    step: guide?.data.steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.name,
      url: url(`/guides/${slug}#${step.anchor}`),
    })),
  };

  return (
    <div>
      <HeroContainer>
        <div className="col">
          <Link
            className="mb-4 flex items-center gap-2 text-muted-foreground"
            href={goBackUrl}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            <span>Back to all guides</span>
          </Link>
          <SectionHeader
            as="h1"
            description={guide?.data.description}
            title={guide?.data.title}
          />
          <div className="row mt-8 items-center gap-4">
            <div className="center-center size-10 rounded-full bg-black">
              {author?.image ? (
                <Image
                  alt={author.name}
                  className="size-10 rounded-full object-cover"
                  height={48}
                  src={author.image}
                  width={48}
                />
              ) : (
                <Logo className="h-6 w-6 fill-white" />
              )}
            </div>
            <div className="col flex-1">
              <p className="font-medium">{author?.name || 'OpenPanel Team'}</p>
              <div className="row items-center gap-4">
                <p className="text-muted-foreground text-sm">
                  {guide?.data.date.toLocaleDateString()}
                </p>
                {guide?.data.updated && (
                  <p className="text-muted-foreground text-sm italic">
                    Updated on {guide?.data.updated.toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <div className="row items-center gap-3">
              <span
                className={`rounded px-3 py-1 font-mono text-xs ${difficultyColors[guide?.data.difficulty || 'beginner']}`}
              >
                {difficultyLabels[guide?.data.difficulty || 'beginner']}
              </span>
              <div className="row items-center gap-1 text-muted-foreground text-sm">
                <ClockIcon className="h-4 w-4" />
                <span>{guide?.data.timeToComplete} min</span>
              </div>
            </div>
          </div>
        </div>
      </HeroContainer>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="guide-howto-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <article className="col container max-w-5xl">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <div className="prose [&_img]:h-auto [&_img]:max-w-full [&_table]:w-auto">
              <Body components={getMDXComponents()} />
            </div>
          </div>
          <aside className="col gap-8 pb-12 pl-12">
            <Toc toc={guide?.data.toc} />
            <FeatureCardContainer className="gap-2">
              <span className="font-semibold text-lg">Try OpenPanel</span>
              <p className="mb-4 text-muted-foreground text-sm">
                Give it a spin for free. No credit card required.
              </p>
              <GetStartedButton />
            </FeatureCardContainer>
          </aside>
        </div>

        {relatedGuides.length > 0 && (
          <div className="my-16">
            <h3 className="mb-8 font-bold text-2xl">Related guides</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {relatedGuides.map((item) => (
                <GuideCard
                  cover={item.data.cover}
                  date={item.data.date}
                  difficulty={item.data.difficulty}
                  key={item.url}
                  team={item.data.team}
                  timeToComplete={item.data.timeToComplete}
                  title={item.data.title}
                  url={item.url}
                />
              ))}
            </div>
          </div>
        )}
      </article>
      <Testimonials />
      <CtaBanner />
    </div>
  );
}
