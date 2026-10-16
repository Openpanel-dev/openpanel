'use client';

import {
  AlertCircle,
  CheckCircle2,
  Code,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Share2,
  Shield,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { SocialPreview } from './social-preview';
import { FaqItem, Faqs } from '@/components/faq';
import { FeatureCardContainer } from '@/components/feature-card';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_URL } from '@/lib/api-url';
import { cn } from '@/lib/utils';

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
    redirectChain: { url: string; status: number; responseTime: number }[];
    responseTime: {
      dns: number;
      connect: number;
      tls: number;
      ttfb: number;
      total: number;
    };
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

type Tab = 'seo' | 'social' | 'technical' | 'security';

export default function SiteCheckerPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [result, setResult] = useState<SiteCheckResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('seo');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `${API_URL}/tools/site-checker?url=${encodeURIComponent(url)}`
      );
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setIsRateLimited(true);
          throw new Error(
            'Rate limit exceeded. Please wait a minute before trying again.'
          );
        }
        setIsRateLimited(false);
        throw new Error(data.error || 'Failed to check site');
      }

      setIsRateLimited(false);

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const StatusIcon = ({
    status,
  }: {
    status: 'pass' | 'fail' | 'warning' | 'info';
  }) => {
    switch (status) {
      case 'pass':
        return (
          <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
        );
      case 'fail':
        return <XCircle className="size-5 text-destructive" />;
      case 'warning':
        return (
          <AlertCircle className="size-5 text-amber-600 dark:text-amber-400" />
        );
      default:
        return <AlertCircle className="size-5 text-primary" />;
    }
  };

  const InfoRow = ({
    label,
    value,
    status,
    helpText,
  }: {
    label: string;
    value: React.ReactNode;
    status?: 'pass' | 'fail' | 'warning' | 'info';
    helpText?: string;
  }) => (
    <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-medium text-sm">{label}</span>
          {status && <StatusIcon status={status} />}
        </div>
        <div className="break-words text-muted-foreground text-sm">{value}</div>
        {helpText && (
          <div className="mt-1 text-muted-foreground text-xs">{helpText}</div>
        )}
      </div>
    </div>
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'seo', label: 'SEO', icon: <Search className="size-4" /> },
    { id: 'social', label: 'Social', icon: <Share2 className="size-4" /> },
    { id: 'technical', label: 'Technical', icon: <Code className="size-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="size-4" /> },
  ];

  return (
    <div className="max-w-4xl">
      <SectionHeader
        as="h1"
        description="Analyze any website for SEO, social media, technical, and security information. Get comprehensive insights about any URL."
        title="URL Checker"
        variant="default"
      />

      <form className="mt-8" onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <Input
            className="flex-1"
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            size="lg"
            type="url"
            value={url}
          />
          <Button disabled={loading} size="lg" type="submit">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Search className="size-4" />
                Check
              </>
            )}
          </Button>
        </div>
      </form>

      {error && (
        <div
          className={cn(
            'mt-4 rounded-lg border p-4',
            isRateLimited
              ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'border-destructive/20 bg-destructive/10 text-destructive'
          )}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium">{error}</div>
              {isRateLimited && (
                <div className="mt-1 text-sm opacity-90">
                  You can make up to 10 requests per minute. Please try again
                  shortly.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-8">
          {/* Header with final URL */}
          <FeatureCardContainer className="mb-6 gap-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">Final URL</span>
            </div>
            <div className="row items-center gap-2">
              <img
                alt="Favicon"
                className="size-4 rounded-xs"
                src={`https://api.openpanel.dev/misc/favicon?url=${encodeURIComponent(result.finalUrl)}`}
              />
              <a
                className="flex items-center gap-1 break-all text-muted-foreground text-sm hover:text-foreground"
                href={result.finalUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {result.finalUrl}
                <ExternalLink className="size-3" />
              </a>
            </div>
            {result.url !== result.finalUrl && (
              <div className="mt-1 text-muted-foreground text-xs">
                Redirected from: {result.url}
              </div>
            )}
          </FeatureCardContainer>

          {/* Tabs */}
          <div className="mb-6 border-b">
            <div className="flex gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-4 py-2 font-medium text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* SEO Tab */}
          {activeTab === 'seo' && (
            <div className="space-y-4">
              <InfoRow
                helpText={`${result.seo.title.length} characters (recommended: 30-60)`}
                label="Title"
                status={
                  result.seo.title.length > 0
                    ? result.seo.title.length >= 30 &&
                      result.seo.title.length <= 60
                      ? 'pass'
                      : 'warning'
                    : 'fail'
                }
                value={result.seo.title.value || 'Not set'}
              />
              <InfoRow
                helpText={`${result.seo.description.length} characters (recommended: 120-160)`}
                label="Meta Description"
                status={
                  result.seo.description.length > 0
                    ? result.seo.description.length >= 120 &&
                      result.seo.description.length <= 160
                      ? 'pass'
                      : 'warning'
                    : 'fail'
                }
                value={result.seo.description.value || 'Not set'}
              />
              <InfoRow
                label="Canonical URL"
                status={result.seo.canonical ? 'pass' : 'warning'}
                value={result.seo.canonical || 'Not set'}
              />
              <InfoRow
                helpText={
                  result.seo.h1.length === 0
                    ? 'No H1 tag found'
                    : result.seo.h1.length > 1
                      ? 'Multiple H1 tags found (recommended: 1)'
                      : 'One H1 tag found'
                }
                label="H1 Tags"
                status={
                  result.seo.h1.length === 1
                    ? 'pass'
                    : result.seo.h1.length === 0
                      ? 'fail'
                      : 'warning'
                }
                value={
                  result.seo.h1.length > 0 ? (
                    <ul className="list-inside list-disc space-y-1">
                      {result.seo.h1.map((h1) => (
                        <li key={h1}>{h1}</li>
                      ))}
                    </ul>
                  ) : (
                    'Not found'
                  )
                }
              />
              <InfoRow
                label="Robots Meta"
                status={result.seo.robotsMeta ? 'info' : 'pass'}
                value={result.seo.robotsMeta || 'Not set'}
              />
              <InfoRow
                label="Robots.txt"
                status={
                  result.seo.robotsTxtStatus === 'allowed'
                    ? 'pass'
                    : result.seo.robotsTxtStatus === 'blocked'
                      ? 'fail'
                      : 'warning'
                }
                value={
                  result.seo.robotsTxtStatus === 'allowed'
                    ? 'Allowed'
                    : result.seo.robotsTxtStatus === 'blocked'
                      ? 'Blocked'
                      : 'Error checking'
                }
              />
              <InfoRow
                helpText={
                  result.seo.hasSitemap
                    ? '/sitemap.xml exists'
                    : '/sitemap.xml not found'
                }
                label="Sitemap"
                status={result.seo.hasSitemap ? 'pass' : 'warning'}
                value={result.seo.hasSitemap ? 'Found' : 'Not found'}
              />
            </div>
          )}

          {/* Social Tab */}
          {activeTab === 'social' && (
            <div className="space-y-6">
              {/* Preview Card */}
              <div>
                <div className="mb-4">
                  <h3 className="mb-2 font-semibold text-lg">
                    Social Media Preview
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    See how your link will appear when shared on social media
                    platforms
                  </p>
                </div>
                <div className="max-w-md">
                  <SocialPreview
                    description={
                      result.social.og.description ||
                      result.social.twitter.description ||
                      result.seo.description.value
                    }
                    domain={new URL(result.finalUrl).hostname}
                    image={
                      result.social.og.image || result.social.twitter.image
                    }
                    title={
                      result.social.og.title ||
                      result.social.twitter.title ||
                      result.seo.title.value
                    }
                    url={result.finalUrl}
                  />
                </div>
              </div>

              <div className="mb-4">
                <h3 className="mb-3 font-semibold text-lg">
                  Open Graph Details
                </h3>
                <div className="space-y-2">
                  <InfoRow
                    label="OG Title"
                    status={result.social.og.title ? 'pass' : 'warning'}
                    value={result.social.og.title || 'Not set'}
                  />
                  <InfoRow
                    label="OG Description"
                    status={result.social.og.description ? 'pass' : 'warning'}
                    value={result.social.og.description || 'Not set'}
                  />
                  <InfoRow
                    label="OG Image"
                    status={result.social.og.image ? 'pass' : 'warning'}
                    value={
                      result.social.og.image ? (
                        <a
                          className="flex items-center gap-1 text-primary hover:underline"
                          href={result.social.og.image}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {result.social.og.image}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        'Not set'
                      )
                    }
                  />
                  <InfoRow
                    label="OG URL"
                    status={result.social.og.url ? 'pass' : 'warning'}
                    value={result.social.og.url || 'Not set'}
                  />
                  <InfoRow
                    label="OG Type"
                    status={result.social.og.type ? 'pass' : 'warning'}
                    value={result.social.og.type || 'Not set'}
                  />
                </div>
              </div>

              <div>
                <h3 className="mb-3 font-semibold text-lg">
                  Twitter Card Details
                </h3>
                <div className="space-y-2">
                  <InfoRow
                    label="Card Type"
                    status={result.social.twitter.card ? 'pass' : 'warning'}
                    value={result.social.twitter.card || 'Not set'}
                  />
                  <InfoRow
                    label="Twitter Title"
                    status={result.social.twitter.title ? 'pass' : 'warning'}
                    value={result.social.twitter.title || 'Not set'}
                  />
                  <InfoRow
                    label="Twitter Description"
                    status={
                      result.social.twitter.description ? 'pass' : 'warning'
                    }
                    value={result.social.twitter.description || 'Not set'}
                  />
                  <InfoRow
                    label="Twitter Image"
                    status={result.social.twitter.image ? 'pass' : 'warning'}
                    value={
                      result.social.twitter.image ? (
                        <a
                          className="flex items-center gap-1 text-primary hover:underline"
                          href={result.social.twitter.image}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {result.social.twitter.image}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        'Not set'
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Technical Tab */}
          {activeTab === 'technical' && (
            <div className="space-y-4">
              <InfoRow
                label="HTTP Status"
                status={
                  result.technical.statusCode >= 200 &&
                  result.technical.statusCode < 300
                    ? 'pass'
                    : result.technical.statusCode >= 300 &&
                        result.technical.statusCode < 400
                      ? 'warning'
                      : 'fail'
                }
                value={
                  <span
                    className={cn(
                      'font-mono',
                      result.technical.statusCode >= 200 &&
                        result.technical.statusCode < 300
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : result.technical.statusCode >= 300 &&
                            result.technical.statusCode < 400
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-destructive'
                    )}
                  >
                    {result.technical.statusCode}
                  </span>
                }
              />
              {result.technical.redirectChain.length > 0 && (
                <div>
                  <div className="mb-2 font-medium">Redirect Chain</div>
                  <div className="space-y-2">
                    {result.technical.redirectChain.map((hop, i) => (
                      <div
                        className="flex items-center gap-2 rounded bg-accent p-2 text-sm"
                        key={hop.url}
                      >
                        <span className="font-mono text-xs">{hop.status}</span>
                        <span className="flex-1 truncate">{hop.url}</span>
                        <span className="text-muted-foreground text-xs">
                          {hop.responseTime}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Detailed Response Time Breakdown */}
              <FeatureCardContainer className="space-y-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold">Response Time Breakdown</h4>
                  <span
                    className={cn(
                      'font-bold text-lg',
                      result.technical.responseTime.total < 1000
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : result.technical.responseTime.total < 3000
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-destructive'
                    )}
                  >
                    {result.technical.responseTime.total}ms total
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">DNS Lookup</span>
                    <span className="font-mono">
                      {result.technical.responseTime.dns}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Connection</span>
                    <span className="font-mono">
                      {result.technical.responseTime.connect}ms
                    </span>
                  </div>
                  {result.technical.responseTime.tls > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        TLS Handshake
                      </span>
                      <span className="font-mono">
                        {result.technical.responseTime.tls}ms
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Time to First Byte (TTFB)
                    </span>
                    <span className="font-mono">
                      {result.technical.responseTime.ttfb}ms
                    </span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Total</span>
                      <span className="font-mono font-semibold">
                        {result.technical.responseTime.total}ms
                      </span>
                    </div>
                  </div>
                </div>
              </FeatureCardContainer>
              <InfoRow
                label="Content Type"
                status="info"
                value={result.technical.contentType}
              />
              <InfoRow
                label="Page Size"
                status="info"
                value={`${(result.technical.pageSize / 1024).toFixed(2)} KB`}
              />
              <InfoRow
                label="Server"
                status="info"
                value={result.technical.server || 'Not detected'}
              />
              {result.technical.ssl && (
                <InfoRow
                  label="SSL Certificate"
                  status={result.technical.ssl.valid ? 'pass' : 'fail'}
                  value={
                    <div>
                      <div>Issuer: {result.technical.ssl.issuer}</div>
                      <div className="mt-1 text-muted-foreground text-xs">
                        Expires:{' '}
                        {new Date(
                          result.technical.ssl.expires
                        ).toLocaleDateString()}
                      </div>
                    </div>
                  }
                />
              )}
              {/* Server IP & Hosting Info */}
              {result.hosting.ip && (
                <FeatureCardContainer className="space-y-3">
                  <div className="mb-3 flex items-center gap-2">
                    <Globe className="size-5" />
                    <h4 className="font-semibold">Server IP & Hosting</h4>
                  </div>

                  <InfoRow
                    label="IP Address"
                    status="info"
                    value={result.hosting.ip}
                  />

                  {result.hosting.location && (
                    <InfoRow
                      label="Location"
                      status="info"
                      value={
                        <div>
                          {result.hosting.location.city &&
                          result.hosting.location.country ? (
                            <>
                              {result.hosting.location.city}
                              {result.hosting.location.region &&
                                `, ${result.hosting.location.region}`}
                              {`, ${result.hosting.location.country}`}
                              {result.hosting.location.latitude &&
                                result.hosting.location.longitude && (
                                  <div className="mt-1 text-muted-foreground text-xs">
                                    {result.hosting.location.latitude.toFixed(
                                      4
                                    )}
                                    ,{' '}
                                    {result.hosting.location.longitude.toFixed(
                                      4
                                    )}
                                  </div>
                                )}
                            </>
                          ) : (
                            result.hosting.location.country || 'Unknown'
                          )}
                        </div>
                      }
                    />
                  )}

                  {result.hosting.isp && (
                    <InfoRow
                      label="ISP"
                      status="info"
                      value={result.hosting.isp}
                    />
                  )}

                  {result.hosting.asn && (
                    <InfoRow
                      label="ASN"
                      status="info"
                      value={result.hosting.asn}
                    />
                  )}

                  {result.hosting.organization && (
                    <InfoRow
                      label="Organization"
                      status="info"
                      value={result.hosting.organization}
                    />
                  )}

                  {result.hosting.cdn && (
                    <InfoRow
                      label="CDN"
                      status="pass"
                      value={result.hosting.cdn}
                    />
                  )}

                  <div className="space-y-2 border-t pt-2 text-muted-foreground text-xs">
                    <div>
                      <strong>Location data:</strong> Powered by{' '}
                      <a
                        className="text-primary hover:underline"
                        href="https://www.maxmind.com/en/geoip2-services-and-databases"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        MaxMind GeoLite2
                      </a>{' '}
                      database
                    </div>
                    {(result.hosting.isp || result.hosting.asn) && (
                      <div>
                        <strong>Network data:</strong> ISP/ASN information from{' '}
                        <a
                          className="text-primary hover:underline"
                          href="https://ip-api.com"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          ip-api.com
                        </a>
                      </div>
                    )}
                  </div>
                </FeatureCardContainer>
              )}

              {!result.hosting.ip && (
                <InfoRow
                  label="Server IP"
                  status="warning"
                  value="Not resolved"
                />
              )}
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <FeatureCardContainer className="mb-4">
                <div className="mb-2 flex items-center gap-2">
                  <Shield className="size-5" />
                  <span className="font-semibold">Security Score</span>
                </div>
                <div className="font-bold text-3xl">
                  {result.security.score}/100
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all',
                      result.security.score >= 70
                        ? 'bg-emerald-600 dark:bg-emerald-400'
                        : result.security.score >= 40
                          ? 'bg-amber-600 dark:bg-amber-400'
                          : 'bg-destructive'
                    )}
                    style={{ width: `${result.security.score}%` }}
                  />
                </div>
              </FeatureCardContainer>

              <InfoRow
                helpText={
                  result.security.csp
                    ? 'CSP header is present'
                    : 'CSP header is missing'
                }
                label="Content-Security-Policy"
                status={result.security.csp ? 'pass' : 'fail'}
                value={result.security.csp || 'Not set'}
              />
              <InfoRow
                helpText={
                  result.security.xFrameOptions
                    ? 'Protects against clickjacking'
                    : 'Missing X-Frame-Options header'
                }
                label="X-Frame-Options"
                status={
                  result.security.xFrameOptions
                    ? result.security.xFrameOptions.toLowerCase() === 'deny' ||
                      result.security.xFrameOptions.toLowerCase() ===
                        'sameorigin'
                      ? 'pass'
                      : 'warning'
                    : 'fail'
                }
                value={result.security.xFrameOptions || 'Not set'}
              />
              <InfoRow
                helpText={
                  result.security.xContentTypeOptions?.toLowerCase() ===
                  'nosniff'
                    ? 'Prevents MIME type sniffing'
                    : 'Missing or incorrect X-Content-Type-Options header'
                }
                label="X-Content-Type-Options"
                status={
                  result.security.xContentTypeOptions?.toLowerCase() ===
                  'nosniff'
                    ? 'pass'
                    : result.security.xContentTypeOptions
                      ? 'warning'
                      : 'fail'
                }
                value={result.security.xContentTypeOptions || 'Not set'}
              />
              <InfoRow
                helpText={
                  result.security.hsts
                    ? 'Forces HTTPS connections'
                    : 'HSTS header is missing (only applies to HTTPS sites)'
                }
                label="Strict-Transport-Security (HSTS)"
                status={result.security.hsts ? 'pass' : 'warning'}
                value={result.security.hsts || 'Not set'}
              />
            </div>
          )}
        </div>
      )}

      {/* SEO Content Section */}
      <div className="prose prose-neutral dark:prose-invert mt-16 max-w-none">
        <article className="space-y-8">
          <div>
            <h2 className="mb-4 font-bold text-3xl">
              Free URL Checker & Website Analysis Tool
            </h2>
            <p className="mb-6 text-lg text-muted-foreground">
              Check any URL for SEO issues, security problems, and performance
              bottlenecks. Our free site checker analyzes meta tags, social
              previews, security headers, and server configuration in seconds.
            </p>
          </div>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              What This URL Checker Analyzes
            </h3>
            <p className="mb-4">
              Paste any URL and get a complete breakdown of how the page
              performs across four critical areas:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <strong>SEO Health:</strong> Title tags, meta descriptions, H1
                tags, canonical URLs, and indexability status
              </li>
              <li>
                <strong>Social Previews:</strong> How your link appears when
                shared on Facebook, Twitter, and LinkedIn
              </li>
              <li>
                <strong>Performance:</strong> Response times, TTFB, DNS lookup,
                TLS handshake, and server location
              </li>
              <li>
                <strong>Security:</strong> SSL certificate status, security
                headers, and vulnerability checks
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">SEO Analysis</h3>

            <h4 className="mt-6 mb-3 font-semibold text-xl">Title Tags</h4>
            <p className="mb-4">
              Title tags appear in search results and browser tabs. They're one
              of the strongest on-page ranking signals. Our URL checker verifies
              your title is:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>Between 30-60 characters (optimal for search display)</li>
              <li>Present and not empty</li>
              <li>Unique and descriptive</li>
            </ul>

            <h4 className="mt-6 mb-3 font-semibold text-xl">
              Meta Descriptions
            </h4>
            <p className="mb-4">
              Meta descriptions don't directly affect rankings but significantly
              impact click-through rates. A good description is 120-160
              characters, includes a clear value proposition, and encourages
              clicks.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">H1 Tags</h4>
            <p className="mb-4">
              Each page should have exactly one H1 tag that clearly describes
              the page content. Our checker flags missing H1s and helps ensure
              proper heading structure.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">Canonical URLs</h4>
            <p className="mb-4">
              Canonical tags prevent duplicate content issues by telling search
              engines which URL version is authoritative. This matters for pages
              accessible via multiple URLs, parameter variations, or HTTP/HTTPS
              and www/non-www variants.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">Indexability</h4>
            <p className="mb-4">
              The checker analyzes robots.txt rules and meta robots tags to
              determine if search engines can crawl and index your page. You'll
              see clear warnings if anything blocks indexing.
            </p>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              Social Media Previews
            </h3>
            <p className="mb-4">
              When someone shares your URL on social media, Open Graph and
              Twitter Card tags control what appears. Without them, platforms
              guess—often poorly.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">Open Graph Tags</h4>
            <p className="mb-4">
              Open Graph controls how links display on Facebook, LinkedIn, and
              most other platforms. Essential tags include:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <code>og:title</code> — Title shown in the share card
              </li>
              <li>
                <code>og:description</code> — Summary text beneath the title
              </li>
              <li>
                <code>og:image</code> — Preview image (recommended: 1200×630px)
              </li>
              <li>
                <code>og:url</code> — Canonical URL for the content
              </li>
            </ul>

            <h4 className="mt-6 mb-3 font-semibold text-xl">Twitter Cards</h4>
            <p className="mb-4">
              Twitter uses its own card format. Our site checker verifies:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <code>twitter:card</code> — Card type (summary or
                summary_large_image)
              </li>
              <li>
                <code>twitter:title</code> and <code>twitter:description</code>
              </li>
              <li>
                <code>twitter:image</code> — Image for the tweet preview
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">Performance Metrics</h3>
            <p className="mb-4">
              Page speed affects both user experience and search rankings. Our
              URL checker breaks down exactly where time is spent:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <strong>DNS Lookup:</strong> Time to resolve domain to IP
                address. Slow DNS? Consider a faster provider or DNS caching.
              </li>
              <li>
                <strong>Connection Time:</strong> TCP connection establishment.
                Affected by server location relative to users.
              </li>
              <li>
                <strong>TLS Handshake:</strong> SSL/TLS negotiation for HTTPS.
                Modern TLS versions and CDNs reduce this.
              </li>
              <li>
                <strong>Time to First Byte (TTFB):</strong> Time until server
                starts responding. Under 200ms is good. This reflects server
                processing speed.
              </li>
              <li>
                <strong>Total Time:</strong> Complete request including body
                download.
              </li>
            </ul>

            <h4 className="mt-6 mb-3 font-semibold text-xl">
              Server Information
            </h4>
            <p className="mb-4">
              The checker also reveals hosting details: server IP and location,
              hosting provider, CDN detection (Cloudflare, Fastly, Vercel,
              etc.), and server software (Nginx, Apache).
            </p>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">Security Analysis</h3>
            <p className="mb-4">
              Security headers protect your site and visitors from common
              attacks. Our checker evaluates four critical headers:
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">
              Content Security Policy (CSP)
            </h4>
            <p className="mb-4">
              CSP prevents cross-site scripting (XSS) by controlling which
              resources can load. It restricts scripts to trusted sources and
              blocks inline execution.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">X-Frame-Options</h4>
            <p className="mb-4">
              Prevents clickjacking by controlling whether your page can be
              embedded in iframes. Set to DENY or SAMEORIGIN for protection.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">
              X-Content-Type-Options
            </h4>
            <p className="mb-4">
              Set to <code>nosniff</code> to prevent browsers from MIME-type
              sniffing, which can lead to security vulnerabilities.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">
              Strict-Transport-Security (HSTS)
            </h4>
            <p className="mb-4">
              Forces HTTPS connections, preventing protocol downgrade attacks.
              Essential for sites handling any sensitive data.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">SSL Certificate</h4>
            <p className="mb-4">
              The checker verifies your SSL certificate is valid, trusted, and
              not expiring soon. Expired certificates trigger browser warnings
              that destroy user trust.
            </p>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              How to Use This Website Checker
            </h3>
            <ol className="mb-6 ml-4 list-inside list-decimal space-y-3">
              <li>
                <strong>Enter a URL:</strong> Paste any web address (with or
                without https://)
              </li>
              <li>
                <strong>Click Check:</strong> Analysis takes 2-5 seconds
              </li>
              <li>
                <strong>Review results:</strong> Navigate the tabs for SEO,
                Social, Performance, and Security details
              </li>
              <li>
                <strong>Fix issues:</strong> Address any warnings or missing
                elements
              </li>
            </ol>
            <p className="mb-4">
              Pro tip: Check your pages after any significant changes, and
              periodically audit competitor sites to see what they're doing
              right.
            </p>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              Quick Optimization Checklist
            </h3>

            <h4 className="mt-6 mb-3 font-semibold text-xl">SEO Essentials</h4>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>Unique title tag (30-60 characters) on every page</li>
              <li>Compelling meta description (120-160 characters)</li>
              <li>Single, descriptive H1 tag</li>
              <li>Canonical URL set correctly</li>
              <li>Page is indexable (no accidental noindex)</li>
            </ul>

            <h4 className="mt-6 mb-3 font-semibold text-xl">Performance</h4>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>TTFB under 200ms</li>
              <li>Use a CDN for global reach</li>
              <li>Enable compression (gzip/brotli)</li>
              <li>Optimize images and enable caching</li>
            </ul>

            <h4 className="mt-6 mb-3 font-semibold text-xl">Security</h4>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>Valid SSL certificate (not expiring soon)</li>
              <li>All four security headers configured</li>
              <li>HSTS enabled for HTTPS enforcement</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              Frequently Asked Questions
            </h3>

            <Faqs>
              <FaqItem question="What's the difference between a URL checker and a site checker?">
                A URL checker analyzes a single page. A full site checker crawls
                your entire website. This tool checks individual URLs, which is
                faster and useful for spot-checking specific pages.
              </FaqItem>

              <FaqItem question="How often should I check my URLs?">
                Check after publishing new pages, making significant updates, or
                changing hosting/CDN configuration. Monthly audits of key pages
                catch issues before they impact rankings.
              </FaqItem>

              <FaqItem question="What's a good TTFB (Time to First Byte)?">
                Under 200ms is good. 200-500ms is acceptable. Over 500ms
                suggests server or configuration issues worth investigating.
              </FaqItem>

              <FaqItem question="What security score should I aim for?">
                100% means all four security headers are present. Aim for at
                least 75% (three headers). CSP can be complex to implement but
                the others are straightforward.
              </FaqItem>

              <FaqItem question="Can I check competitor websites?">
                Yes. The tool works on any public URL. Analyzing competitors
                reveals their SEO strategies, hosting setup, and security
                posture.
              </FaqItem>

              <FaqItem question="Why is my page marked as not indexable?">
                Common causes: a noindex meta tag, robots.txt blocking crawlers,
                or canonical pointing elsewhere. Check the SEO tab for specific
                details.
              </FaqItem>

              <FaqItem question="Is this tool free?">
                Yes, completely free. We rate-limit to 10 checks per minute per
                IP to ensure availability for everyone.
              </FaqItem>
            </Faqs>
          </section>

          <section className="mt-8 border-t pt-8">
            <h3 className="mb-4 font-semibold text-2xl">
              Start Checking URLs Now
            </h3>
            <p className="mb-6">
              Enter any URL above to get instant insights into SEO, performance,
              security, and social sharing. Find issues before they hurt your
              rankings or user experience.
            </p>
            <p className="text-muted-foreground">
              <strong>Built by OpenPanel</strong> — the open-source analytics
              platform. We use these same checks to help thousands of websites
              understand their traffic and optimize performance.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
