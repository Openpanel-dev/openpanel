import urlMetadata from 'url-metadata';

const URL_METADATA_TIMEOUT_MS = 500;

interface UrlMetaData {
  favicons: {
    rel: string;
    href: string;
    sizes: string;
  }[];
  'og:image'?: string;
  'og:image:url'?: string;
  'og:image:secure_url'?: string;
  'twitter:image'?: string;
  'twitter:image:src'?: string;
}

function fallbackFavicon(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    // If URL parsing fails, use the original string
    return `https://icons.duckduckgo.com/ip3/${url}.ico`;
  }
}

function findBestFavicon(favicons: UrlMetaData['favicons']) {
  const match = favicons
    .sort((a, b) => a.rel.length - b.rel.length)
    .find(
      (favicon) =>
        favicon.rel === 'shortcut icon' ||
        favicon.rel === 'icon' ||
        favicon.rel === 'apple-touch-icon'
    );

  return match ? match.href : null;
}

function findBestOgImage(data: UrlMetaData): string | null {
  // Priority order for OG images
  const candidates = [
    data['og:image:secure_url'],
    data['og:image:url'],
    data['og:image'],
    data['twitter:image:src'],
    data['twitter:image'],
  ];

  for (const candidate of candidates) {
    if (candidate?.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function transform(data: UrlMetaData, url: string) {
  const favicon = findBestFavicon(data.favicons);
  const ogImage = findBestOgImage(data);

  return {
    favicon: favicon ? new URL(favicon, url).toString() : fallbackFavicon(url),
    ogImage: ogImage ? new URL(ogImage, url).toString() : null,
  };
}

// This fetch is guarded by url-metadata's own bundled `request-filtering-agent`,
// not by this module's `assertPublicUrl`/`safeFetch` (used for the image fetch
// that follows) — a different SSRF implementation for this hop, not the same one.
export async function parseUrlMeta(url: string) {
  try {
    const metadata = (await urlMetadata(url, {
      timeout: URL_METADATA_TIMEOUT_MS,
    })) as UrlMetaData;
    return transform(metadata, url);
  } catch {
    return {
      favicon: fallbackFavicon(url),
      ogImage: null,
    };
  }
}
