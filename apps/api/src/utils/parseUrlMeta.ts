import urlMetadata from 'url-metadata';

function findBestFavicon(favicons: UrlMetaData['favicons']) {
  const match = favicons.find(
    (favicon) =>
      favicon.rel === 'shortcut icon' ||
      favicon.rel === 'icon' ||
      favicon.rel === 'apple-touch-icon'
  );
  if (match) {
    return match.href;
  }
  return null;
}

function transform(data: UrlMetaData, url: string) {
  const favicon = findBestFavicon(data.favicons);
  return {
    favicon: favicon ? new URL(favicon, url).toString() : null,
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
    return transform(metadata, url);
  } catch (err) {
    return null;
  }
}
