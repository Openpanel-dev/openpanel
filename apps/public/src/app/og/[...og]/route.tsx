import { getAllCompareSlugs, getCompareData } from '@/lib/compare';
import { getFeatureData } from '@/lib/features';
import { url as baseUrl } from '@/lib/layout.shared';
import { articleSource, guideSource, pageSource, source } from '@/lib/source';
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

// Truncate text helper
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength).trim()}...`;
}

async function getOgData(
  segments: string[],
): Promise<{ title: string; description?: string }> {
  switch (segments[0]) {
    case 'default':
      return {
        title: 'Home',
        description: 'Home page',
      };
    case 'supporter': {
      return {
        title: 'Become a Supporter',
        description:
          'Support OpenPanel and get exclusive perks like latest Docker images, prioritized support, and early access to new features.',
      };
    }
    case 'open-source': {
      return {
        title: 'Free analytics for open source projects',
        description:
          "Get free web and product analytics for your open source project. Track up to 2.5M events/month. Apply to OpenPanel's open source program today.",
      };
    }
    case 'pricing': {
      return {
        title: 'Pricing',
        description:
          'Our pricing is as simple as it gets, choose how many events you want to track each month, everything else is unlimited, no tiers, no hidden costs.',
      };
    }
    case 'articles': {
      if (segments.length > 1) {
        const data = await articleSource.getPage(segments.slice(1));
        return {
          title: data?.data.title ?? 'Article Not Found',
          description:
            data?.data.description || 'Whooops, could not find this article',
        };
      }
      return {
        title: 'Articles',
        description:
          'Read our latest articles and stay up to date with the latest news and updates.',
      };
    }
    case 'compare': {
      const slug = segments[1];
      if (!slug) {
        return {
          title: 'Compare alternatives',
          description: 'Compare OpenPanel with other analytics tools',
        };
      }
      const data = await getCompareData(slug);
      return {
        title: data?.seo.title || data?.hero.heading || 'Compare',
        description: data?.seo.description || data?.hero.subheading,
      };
    }
    case 'guides': {
      if (segments.length > 1) {
        const data = await guideSource.getPage(segments.slice(1));
        return {
          title: data?.data.title ?? 'Guide Not Found',
          description:
            data?.data.description || 'Whooops, could not find this guide',
        };
      }
      return {
        title: 'Implementation Guides',
        description: 'Step-by-step tutorials for adding analytics to your app',
      };
    }
    case 'features': {
      const slug = segments[1];
      if (!slug) {
        return {
          title: 'Product analytics features',
          description:
            'Explore OpenPanel features: event tracking, funnels, retention, user profiles, and more.',
        };
      }
      const featureData = await getFeatureData(slug);
      return {
        title: featureData?.seo.title ?? 'Feature Not Found',
        description:
          featureData?.seo.description ?? featureData?.hero.subheading,
      };
    }
    case 'docs': {
      const data = await source.getPage(segments.slice(1));
      return {
        title: data?.data.title ?? 'Page Not Found',
        description:
          data?.data.description || 'Whooops, could not find this page',
      };
    }
    case 'tools': {
      if (segments.length > 1) {
        const tool = segments[1];
        switch (tool) {
          case 'ip-lookup':
            return {
              title: 'IP Lookup Tool',
              description:
                'Find detailed information about any IP address including geolocation, ISP, and network details.',
            };
          case 'url-checker':
            return {
              title: 'URL Checker',
              description:
                'Analyze any website for SEO, social media, technical, and security information. Get comprehensive insights about any URL.',
            };
          default:
            return {
              title: 'Tools',
              description: 'Free web tools for developers and website owners',
            };
        }
      }
      return {
        title: 'Tools',
        description: 'Free web tools for developers and website owners',
      };
    }
    default: {
      const data = await pageSource.getPage(segments);
      return {
        title: data?.data.title || 'Page Not Found',
        description:
          data?.data.description || 'Whooops, could not find this page',
      };
    }
  }
}

// export async function generateStaticParams() {
//   const params: { og: string[] }[] = [];

//   // Static pages
//   params.push({ og: ['default'] });
//   params.push({ og: ['supporter'] });
//   params.push({ og: ['pricing'] });
//   params.push({ og: ['articles'] });
//   params.push({ og: ['compare'] });
//   params.push({ og: ['docs'] });

//   // Articles
//   const articles = await articleSource.getPages();
//   for (const article of articles) {
//     const slug = article.url.replace(/^\/articles\//, '').replace(/\/$/, '');
//     params.push({ og: ['articles', slug] });
//   }

//   // Compare pages
//   const compareSlugs = await getAllCompareSlugs();
//   for (const slug of compareSlugs) {
//     params.push({ og: ['compare', slug] });
//   }

//   // Docs pages
//   const docs = await source.getPages();
//   for (const doc of docs) {
//     params.push({ og: ['docs', ...doc.slugs] });
//   }

//   // Other pages
//   const pages = await pageSource.getPages();
//   for (const page of pages) {
//     params.push({ og: page.slugs });
//   }

//   return params;
// }

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ og: string[] }> },
) {
  try {
    const { og } = await params;

    // Get OG data based on segments
    const { title, description } = await getOgData(og);

    // Truncate title and description
    const truncatedTitle = truncateText(title, 100);
    const truncatedDescription = description
      ? truncateText(description, 200)
      : undefined;

    // Get background image URL
    const backgroundImageUrl = baseUrl('/ogimage-empty.png');

    // Fetch Geist font files from CDN (cache fonts for better performance)
    const [geistRegular, geistBold] = await Promise.all([
      fetch(
        'https://cdn.jsdelivr.net/npm/geist@1.5.1/dist/fonts/geist-sans/Geist-Regular.ttf',
      ).then((res) => res.arrayBuffer()),
      fetch(
        'https://cdn.jsdelivr.net/npm/geist@1.5.1/dist/fonts/geist-sans/Geist-Bold.ttf',
      ).then((res) => res.arrayBuffer()),
    ]);

    return new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          position: 'relative',
          backgroundImage: `url(${backgroundImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
        }}
      >
        {/* Title and Description at bottom left */}
        <div
          style={{
            bottom: '55px',
            left: '55px',
            maxWidth: '900px',
            display: 'flex',
            flexDirection: 'column',
            marginTop: 'auto',
          }}
        >
          {/* Title */}
          <div
            style={{
              fontSize: truncatedTitle.length > 40 ? '56px' : '72px',
              fontFamily: 'GeistBold',
              color: '#000',
              lineHeight: 1.1,
              marginBottom: truncatedDescription ? '20px' : '0',
              fontWeight: 700,
            }}
          >
            {truncatedTitle}
          </div>

          {/* Description */}
          {truncatedDescription ? (
            <div
              style={{
                fontSize: '30px',
                fontFamily: 'Geist',
                color: '#666',
                lineHeight: 1.4,
                fontWeight: 400,
              }}
            >
              {truncatedDescription}
            </div>
          ) : null}
        </div>
      </div>,
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Geist',
            data: geistRegular,
            style: 'normal',
            weight: 400,
          },
          {
            name: 'GeistBold',
            data: geistBold,
            style: 'normal',
            weight: 700,
          },
        ],
      },
    );
  } catch (e: any) {
    console.error(`Failed to generate OG image: ${e.message}`);
    return new Response('Failed to generate the image', {
      status: 500,
    });
  }
}
