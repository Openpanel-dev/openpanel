export function parseSearchParams(
  params: URLSearchParams
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

export function parsePath(path?: string): {
  query?: Record<string, string>;
  path: string;
  origin: string;
  hash?: string;
} {
  if (!path) {
    return {
      path: '',
      origin: '',
    };
  }

  try {
    const url = new URL(path);
    return {
      query: parseSearchParams(url.searchParams),
      path: url.pathname,
      hash: url.hash || undefined,
      origin: url.origin,
    };
  } catch (error) {
    return {
      path,
      origin: '',
    };
  }
}

export function isSameDomain(
  url1: string | undefined,
  url2: string | undefined
) {
  if (!url1 || !url2) {
    return false;
  }
  try {
    return new URL(url1).hostname === new URL(url2).hostname;
  } catch (e) {
    return false;
  }
}
