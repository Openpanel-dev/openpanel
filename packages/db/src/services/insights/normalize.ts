export function normalizeReferrer(name: string): string {
  if (!name || name === '') return 'direct';

  const normalized = name.toLowerCase().trim();

  // Normalize common referrer variations
  const map: Record<string, string> = {
    'm.instagram.com': 'instagram',
    'l.instagram.com': 'instagram',
    'www.instagram.com': 'instagram',
    'instagram.com': 'instagram',
    't.co': 'twitter',
    'twitter.com': 'twitter',
    'x.com': 'twitter',
    'lm.facebook.com': 'facebook',
    'm.facebook.com': 'facebook',
    'facebook.com': 'facebook',
    'l.facebook.com': 'facebook',
    'linkedin.com': 'linkedin',
    'www.linkedin.com': 'linkedin',
    'youtube.com': 'youtube',
    'www.youtube.com': 'youtube',
    'm.youtube.com': 'youtube',
    'reddit.com': 'reddit',
    'www.reddit.com': 'reddit',
    'tiktok.com': 'tiktok',
    'www.tiktok.com': 'tiktok',
  };

  // Check exact match first
  if (map[normalized]) {
    return map[normalized];
  }

  // Check if it contains any of the mapped domains
  for (const [key, value] of Object.entries(map)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // Extract domain from URL if present
  try {
    const url = normalized.startsWith('http')
      ? normalized
      : `https://${normalized}`;
    const hostname = new URL(url).hostname;
    // Remove www. prefix
    return hostname.replace(/^www\./, '');
  } catch {
    // If not a valid URL, return as-is
    return normalized || 'direct';
  }
}

export function normalizePath(path: string): string {
  if (!path || path === '') return '/';

  try {
    // If it's a full URL, extract pathname
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(path, 'http://x');
    const pathname = url.pathname;
    // Normalize trailing slash (remove unless it's root)
    return pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  } catch {
    // If not a valid URL, treat as path
    return path === '/' ? '/' : path.replace(/\/$/, '') || '/';
  }
}

export function normalizeUtmCombo(source: string, medium: string): string {
  const s = (source || '').toLowerCase().trim();
  const m = (medium || '').toLowerCase().trim();
  if (!s && !m) return 'none';
  if (!s) return `utm:${m}`;
  if (!m) return `utm:${s}`;
  return `utm:${s}/${m}`;
}
