import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { getClientIpFromHeaders } from '@openpanel/common/server/get-client-ip';
import { getGeoLocation } from '@openpanel/geo';
import * as cheerio from 'cheerio';
import type { FastifyReply, FastifyRequest } from 'fastify';

const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 10;

interface RedirectHop {
  url: string;
  status: number;
  responseTime: number;
}

interface DetailedTiming {
  dns: number;
  connect: number;
  tls: number;
  ttfb: number;
  total: number;
}

interface SiteCheckResult {
  url: string;
  finalUrl: string;
  timestamp: string;
  seo: {
    title: { value: string; length: number };
    description: { value: string; length: number };
    canonical: string | null;
    h1: string[];
    robotsMeta: string | null;
    robotsTxtStatus: 'allowed' | 'blocked' | 'error';
    hasSitemap: boolean;
  };
  social: {
    og: {
      title: string | null;
      description: string | null;
      image: string | null;
      url: string | null;
      type: string | null;
    };
    twitter: {
      card: string | null;
      title: string | null;
      description: string | null;
      image: string | null;
    };
  };
  technical: {
    statusCode: number;
    redirectChain: RedirectHop[];
    responseTime: DetailedTiming;
    contentType: string;
    pageSize: number;
    server: string | null;
    ssl: {
      valid: boolean;
      issuer: string;
      expires: string;
    } | null;
  };
  hosting: {
    ip: string;
    location: {
      country: string;
      countryName?: string;
      city: string;
      region: string | null;
      timezone: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
    isp: string | null;
    asn: string | null;
    organization: string | null;
    cdn: string | null;
  };
  security: {
    csp: string | null;
    xFrameOptions: string | null;
    xContentTypeOptions: string | null;
    hsts: string | null;
    score: number;
  };
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const SITE_CHECK_WINDOW = 60 * 1000;
const SITE_CHECK_MAX = 10;
const IP_LOOKUP_WINDOW = 60 * 1000;
const IP_LOOKUP_MAX = 20;

function checkRateLimit(
  key: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= max) {
    return false;
  }

  record.count++;
  return true;
}

function detectCDN(headers: Headers): string | null {
  const server = headers.get('server')?.toLowerCase() || '';
  const cfRay = headers.get('cf-ray');
  const vercelId = headers.get('x-vercel-id');
  const fastly = headers.get('fastly-request-id');
  const cloudfront = headers.get('x-amz-cf-id');

  if (cfRay || server.includes('cloudflare')) return 'Cloudflare';
  if (vercelId || server.includes('vercel')) return 'Vercel';
  if (fastly || server.includes('fastly')) return 'Fastly';
  if (cloudfront || server.includes('cloudfront')) return 'CloudFront';
  if (server.includes('nginx')) return 'Nginx';
  if (server.includes('apache')) return 'Apache';

  return null;
}

async function checkRobotsTxt(
  baseUrl: string,
  path: string,
): Promise<'allowed' | 'blocked' | 'error'> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenPanel-SiteChecker/1.0',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return 'error';
    }

    const text = await response.text();
    const rules = text.split('\n').filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    });

    for (const rule of rules) {
      if (rule.toLowerCase().startsWith('disallow:')) {
        const pattern = rule.substring(9).trim();
        if (pattern && path.includes(pattern.replace('*', ''))) {
          return 'blocked';
        }
      }
    }

    return 'allowed';
  } catch {
    return 'error';
  }
}

async function checkSitemap(baseUrl: string): Promise<boolean> {
  try {
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(sitemapUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenPanel-SiteChecker/1.0',
      },
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function getSSLInfo(
  hostname: string,
): Promise<SiteCheckResult['technical']['ssl'] | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate(true);
        socket.destroy();

        if (!cert || !cert.valid_to) {
          resolve(null);
          return;
        }

        resolve({
          valid: new Date(cert.valid_to) > new Date(),
          issuer: cert.issuer?.CN || 'Unknown',
          expires: cert.valid_to,
        });
      },
    );

    socket.on('error', () => {
      resolve(null);
    });

    setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, 3000);
  });
}

async function resolveHostname(hostname: string): Promise<string> {
  try {
    const addresses = await dns.resolve4(hostname);
    return addresses[0] || '';
  } catch {
    return '';
  }
}

interface IPInfo {
  isp: string | null;
  asn: string | null;
  organization: string | null;
}

async function getIPInfo(ip: string): Promise<IPInfo> {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return { isp: null, asn: null, organization: null };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      `https://ip-api.com/json/${ip}?fields=isp,as,org,query,status`,
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return { isp: null, asn: null, organization: null };
    }

    const data = (await response.json()) as {
      status?: string;
      isp?: string;
      as?: string;
      org?: string;
    };

    if (data.status === 'fail') {
      return { isp: null, asn: null, organization: null };
    }

    return {
      isp: data.isp || null,
      asn: data.as ? `AS${data.as.split(' ')[0]}` : null,
      organization: data.org || null,
    };
  } catch {
    return { isp: null, asn: null, organization: null };
  }
}

async function measureConnectionTime(
  hostname: string,
  port: number,
): Promise<{ connectTime: number; tlsTime: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    let connectTime = 0;
    let tlsTime = 0;

    const socket = net.createConnection(port, hostname, () => {
      connectTime = Date.now() - start;

      if (port === 443) {
        const tlsStart = Date.now();
        const tlsSocket = tls.connect({
          socket,
          servername: hostname,
          rejectUnauthorized: false,
        });

        tlsSocket.on('secureConnect', () => {
          tlsTime = Date.now() - tlsStart;
          tlsSocket.destroy();
          resolve({ connectTime, tlsTime });
        });

        tlsSocket.on('error', () => {
          tlsSocket.destroy();
          resolve({ connectTime, tlsTime: 0 });
        });
      } else {
        socket.destroy();
        resolve({ connectTime, tlsTime: 0 });
      }
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ connectTime: Date.now() - start, tlsTime: 0 });
    });

    setTimeout(() => {
      socket.destroy();
      resolve({ connectTime: Date.now() - start, tlsTime: 0 });
    }, 5000);
  });
}

async function fetchWithRedirects(
  url: string,
  maxRedirects: number = MAX_REDIRECTS,
): Promise<{
  finalUrl: string;
  redirectChain: RedirectHop[];
  html: string;
  headers: Headers;
  statusCode: number;
  timing: DetailedTiming;
}> {
  const redirectChain: RedirectHop[] = [];
  let currentUrl = url;
  let finalHeaders: Headers | null = null;
  let finalStatusCode = 0;
  let finalHtml = '';
  const totalStartTime = Date.now();

  let dnsTime = 0;
  let connectTime = 0;
  let tlsTime = 0;
  let ttfbTime = 0;

  try {
    const urlObj = new URL(currentUrl);
    const hostname = urlObj.hostname;
    const port = urlObj.port
      ? Number.parseInt(urlObj.port, 10)
      : urlObj.protocol === 'https:'
        ? 443
        : 80;

    const dnsStart = Date.now();
    await dns.resolve4(hostname).catch(() => {});
    dnsTime = Date.now() - dnsStart;

    if (port === 443 || port === 80) {
      const connTiming = await measureConnectionTime(hostname, port);
      connectTime = connTiming.connectTime;
      tlsTime = connTiming.tlsTime;
    }
  } catch {
    // continue
  }

  let firstRequestStartTime = 0;

  for (let i = 0; i < maxRedirects; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const hopStartTime = Date.now();
      if (i === 0) {
        firstRequestStartTime = hopStartTime;
      }

      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; OpenPanel-SiteChecker/1.0; +https://openpanel.dev)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      clearTimeout(timeout);
      const hopResponseTime = Date.now() - hopStartTime;

      if (i === 0 && ttfbTime === 0) {
        ttfbTime = Date.now() - firstRequestStartTime;
      }

      if (i === 0) {
        finalHeaders = response.headers;
        finalStatusCode = response.status;
      }

      redirectChain.push({
        url: currentUrl,
        status: response.status,
        responseTime: hopResponseTime,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
      }

      finalHtml = await response.text();
      finalHeaders = response.headers;
      finalStatusCode = response.status;
      break;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  const totalTime = Date.now() - totalStartTime;

  if (ttfbTime === 0 || ttfbTime > totalTime) {
    const estimatedBodyTime = Math.max(0, totalTime * 0.3);
    ttfbTime = Math.max(50, totalTime - estimatedBodyTime);
  }

  return {
    finalUrl: currentUrl,
    redirectChain,
    html: finalHtml,
    headers: finalHeaders || new Headers(),
    statusCode: finalStatusCode,
    timing: {
      dns: dnsTime,
      connect: connectTime,
      tls: tlsTime,
      ttfb: ttfbTime,
      total: totalTime,
    },
  };
}

function calculateSecurityScore(security: SiteCheckResult['security']): number {
  let score = 0;
  if (security.csp) score += 25;
  if (security.xFrameOptions) score += 15;
  if (security.xContentTypeOptions) score += 15;
  if (security.hsts) score += 25;
  if (
    security.xFrameOptions?.toLowerCase() === 'deny' ||
    security.xFrameOptions?.toLowerCase() === 'sameorigin'
  ) {
    score += 10;
  }
  if (security.xContentTypeOptions?.toLowerCase() === 'nosniff') {
    score += 10;
  }
  return Math.min(100, score);
}

export async function siteChecker(
  request: FastifyRequest<{ Querystring: { url?: string } }>,
  reply: FastifyReply,
) {
  const urlParam = request.query.url;

  if (!urlParam) {
    return reply.status(400).send({ error: 'URL parameter is required' });
  }

  const { ip } = getClientIpFromHeaders(request.headers);
  if (ip && !checkRateLimit(`site:${ip}`, SITE_CHECK_WINDOW, SITE_CHECK_MAX)) {
    return reply
      .status(429)
      .send({ error: 'Rate limit exceeded. Please try again later.' });
  }

  let url: URL;
  try {
    url = new URL(urlParam);
  } catch {
    return reply.status(400).send({ error: 'Invalid URL' });
  }

  if (!url.protocol || !url.protocol.startsWith('http')) {
    url = new URL(`https://${urlParam}`);
  }

  try {
    const { finalUrl, redirectChain, html, headers, statusCode, timing } =
      await fetchWithRedirects(url.toString());

    const finalUrlObj = new URL(finalUrl);
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim();
    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';
    const canonical =
      $('link[rel="canonical"]').attr('href') ||
      $('meta[property="og:url"]').attr('content') ||
      null;
    const h1Tags = $('h1')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    const robotsMeta =
      $('meta[name="robots"]').attr('content') ||
      $('meta[name="googlebot"]').attr('content') ||
      null;

    const ogTitle = $('meta[property="og:title"]').attr('content') || null;
    const ogDescription =
      $('meta[property="og:description"]').attr('content') || null;
    const ogImage = $('meta[property="og:image"]').attr('content') || null;
    const ogUrl = $('meta[property="og:url"]').attr('content') || null;
    const ogType = $('meta[property="og:type"]').attr('content') || null;

    const twitterCard = $('meta[name="twitter:card"]').attr('content') || null;
    const twitterTitle =
      $('meta[name="twitter:title"]').attr('content') || null;
    const twitterDescription =
      $('meta[name="twitter:description"]').attr('content') || null;
    const twitterImage =
      $('meta[name="twitter:image"]').attr('content') || null;

    const csp = headers.get('content-security-policy');
    const xFrameOptions = headers.get('x-frame-options');
    const xContentTypeOptions = headers.get('x-content-type-options');
    const hsts = headers.get('strict-transport-security');

    const contentType = headers.get('content-type') || 'unknown';
    const server = headers.get('server');
    const pageSize = new Blob([html]).size;

    const serverIp = await resolveHostname(finalUrlObj.hostname);
    const geo = serverIp ? await getGeoLocation(serverIp) : null;
    const ipInfo = serverIp
      ? await getIPInfo(serverIp)
      : { isp: null, asn: null, organization: null };
    const cdn = detectCDN(headers);

    const ssl = await getSSLInfo(finalUrlObj.hostname);

    const robotsTxtStatus = await checkRobotsTxt(
      finalUrl.toString(),
      finalUrlObj.pathname,
    );

    const hasSitemap = await checkSitemap(finalUrl.toString());

    const security = {
      csp,
      xFrameOptions,
      xContentTypeOptions,
      hsts,
      score: 0,
    };
    security.score = calculateSecurityScore(security);

    const result: SiteCheckResult = {
      url: url.toString(),
      finalUrl,
      timestamp: new Date().toISOString(),
      seo: {
        title: { value: title, length: title.length },
        description: { value: description, length: description.length },
        canonical: canonical ? new URL(canonical, finalUrl).toString() : null,
        h1: h1Tags,
        robotsMeta,
        robotsTxtStatus,
        hasSitemap,
      },
      social: {
        og: {
          title: ogTitle,
          description: ogDescription,
          image: ogImage ? new URL(ogImage, finalUrl).toString() : null,
          url: ogUrl ? new URL(ogUrl, finalUrl).toString() : null,
          type: ogType,
        },
        twitter: {
          card: twitterCard,
          title: twitterTitle,
          description: twitterDescription,
          image: twitterImage
            ? new URL(twitterImage, finalUrl).toString()
            : null,
        },
      },
      technical: {
        statusCode,
        redirectChain,
        responseTime: timing,
        contentType,
        pageSize,
        server,
        ssl,
      },
      hosting: {
        ip: serverIp,
        location: geo
          ? {
              country: geo.country || '',
              city: geo.city || '',
              region: geo.region || null,
              timezone: null,
              latitude: geo.latitude || null,
              longitude: geo.longitude || null,
            }
          : null,
        isp: ipInfo.isp,
        asn: ipInfo.asn,
        organization: ipInfo.organization,
        cdn,
      },
      security,
    };

    return reply.send(result);
  } catch (error) {
    request.log.error({ err: error }, 'Site checker error');
    return reply.status(500).send({
      error:
        error instanceof Error ? error.message : 'Failed to analyze site',
    });
  }
}

function isPrivateIP(ip: string): boolean {
  if (ip === '::1') return true;
  if (ip.startsWith('::ffff:127.')) return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = Number.parseInt(parts[1] || '0', 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }
  if (
    ip.startsWith('fc00:') ||
    ip.startsWith('fd00:') ||
    ip.startsWith('fe80:')
  ) {
    return true;
  }
  return false;
}

export async function ipLookup(
  request: FastifyRequest<{ Querystring: { ip?: string } }>,
  reply: FastifyReply,
) {
  const ipParam = request.query.ip;

  const { ip: clientIp } = getClientIpFromHeaders(request.headers);
  if (
    clientIp &&
    !checkRateLimit(`ip:${clientIp}`, IP_LOOKUP_WINDOW, IP_LOOKUP_MAX)
  ) {
    return reply
      .status(429)
      .send({ error: 'Rate limit exceeded. Please try again later.' });
  }

  const ipToLookup = ipParam ? ipParam.trim() : clientIp || '';

  if (!ipToLookup) {
    return reply
      .status(400)
      .send({ error: 'No IP address provided or detected' });
  }

  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (!ipv4Regex.test(ipToLookup) && !ipv6Regex.test(ipToLookup)) {
    return reply.status(400).send({ error: 'Invalid IP address format' });
  }

  try {
    const geo = await getGeoLocation(ipToLookup);
    const isLocalhost = ipToLookup === '127.0.0.1' || ipToLookup === '::1';
    const isPrivate = isPrivateIP(ipToLookup);

    return reply.send({
      ip: ipToLookup,
      location: {
        country: geo.country,
        city: geo.city,
        region: geo.region,
        latitude: geo.latitude,
        longitude: geo.longitude,
      },
      isLocalhost,
      isPrivate,
    });
  } catch (error) {
    request.log.error({ err: error }, 'IP lookup error');
    return reply.status(500).send({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to lookup IP address',
    });
  }
}
