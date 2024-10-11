import urlMetadata from 'url-metadata';

function fallbackFavicon(url: string) {
  return `https://www.google.com/s2/favicons?domain=${url}&sz=256`;
}

function findBestFavicon(favicons: UrlMetaData['favicons']) {
  const match = favicons.find(
    (favicon) =>
      favicon.rel === 'shortcut icon' ||
      favicon.rel === 'icon' ||
      favicon.rel === 'apple-touch-icon',
  );

  if (match) {
    return match.href;
  }
  return null;
}

function transform(data: UrlMetaData, url: string) {
  const favicon = findBestFavicon(data.favicons);

  return {
    favicon: favicon ? new URL(favicon, url).toString() : fallbackFavicon(url),
  };
}

interface UrlMetaData {
  favicons: {
    rel: string;
    href: string;
    sizes: string;
  }[];
}

export async function parseUrlMeta(url: string) {
  try {
    const metadata = (await urlMetadata(url)) as UrlMetaData;
    const data = transform(metadata, url);
    return data;
  } catch (err) {
    return {
      favicon: fallbackFavicon(url),
    };
  }
}
