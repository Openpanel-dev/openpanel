'use client';

import { FaqItem, Faqs } from '@/components/faq';
import { FeatureCardContainer } from '@/components/feature-card';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/tools/site-checker?url=${encodeURIComponent(url)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setIsRateLimited(true);
          throw new Error(
            'Rate limit exceeded. Please wait a minute before trying again.',
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
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{label}</span>
          {status && <StatusIcon status={status} />}
        </div>
        <div className="text-sm text-muted-foreground break-words">{value}</div>
        {helpText && (
          <div className="text-xs text-muted-foreground mt-1">{helpText}</div>
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
        title="URL Checker"
        description="Analyze any website for SEO, social media, technical, and security information. Get comprehensive insights about any URL."
        variant="default"
        as="h1"
      />

      <form onSubmit={handleSubmit} className="mt-8">
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
            size="lg"
          />
          <Button type="submit" disabled={loading} size="lg">
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
            'mt-4 p-4 rounded-lg border',
            isRateLimited
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
              : 'bg-destructive/10 border-destructive/20 text-destructive',
          )}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="size-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium">{error}</div>
              {isRateLimited && (
                <div className="text-sm mt-1 opacity-90">
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
            <div className="row gap-2 items-center">
              <img
                src={`https://api.openpanel.dev/misc/favicon?url=${encodeURIComponent(result.finalUrl)}`}
                alt="Favicon"
                className="size-4 rounded-xs"
              />
              <a
                href={result.finalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 break-all"
              >
                {result.finalUrl}
                <ExternalLink className="size-3" />
              </a>
            </div>
            {result.url !== result.finalUrl && (
              <div className="text-xs text-muted-foreground mt-1">
                Redirected from: {result.url}
              </div>
            )}
          </FeatureCardContainer>

          {/* Tabs */}
          <div className="border-b mb-6">
            <div className="flex gap-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                    activeTab === tab.id
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
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
                label="Title"
                value={result.seo.title.value || 'Not set'}
                status={
                  result.seo.title.length > 0
                    ? result.seo.title.length >= 30 &&
                      result.seo.title.length <= 60
                      ? 'pass'
                      : 'warning'
                    : 'fail'
                }
                helpText={`${result.seo.title.length} characters (recommended: 30-60)`}
              />
              <InfoRow
                label="Meta Description"
                value={result.seo.description.value || 'Not set'}
                status={
                  result.seo.description.length > 0
                    ? result.seo.description.length >= 120 &&
                      result.seo.description.length <= 160
                      ? 'pass'
                      : 'warning'
                    : 'fail'
                }
                helpText={`${result.seo.description.length} characters (recommended: 120-160)`}
              />
              <InfoRow
                label="Canonical URL"
                value={result.seo.canonical || 'Not set'}
                status={result.seo.canonical ? 'pass' : 'warning'}
              />
              <InfoRow
                label="H1 Tags"
                value={
                  result.seo.h1.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1">
                      {result.seo.h1.map((h1) => (
                        <li key={h1}>{h1}</li>
                      ))}
                    </ul>
                  ) : (
                    'Not found'
                  )
                }
                status={
                  result.seo.h1.length === 1
                    ? 'pass'
                    : result.seo.h1.length === 0
                      ? 'fail'
                      : 'warning'
                }
                helpText={
                  result.seo.h1.length === 0
                    ? 'No H1 tag found'
                    : result.seo.h1.length > 1
                      ? 'Multiple H1 tags found (recommended: 1)'
                      : 'One H1 tag found'
                }
              />
              <InfoRow
                label="Robots Meta"
                value={result.seo.robotsMeta || 'Not set'}
                status={result.seo.robotsMeta ? 'info' : 'pass'}
              />
              <InfoRow
                label="Robots.txt"
                value={
                  result.seo.robotsTxtStatus === 'allowed'
                    ? 'Allowed'
                    : result.seo.robotsTxtStatus === 'blocked'
                      ? 'Blocked'
                      : 'Error checking'
                }
                status={
                  result.seo.robotsTxtStatus === 'allowed'
                    ? 'pass'
                    : result.seo.robotsTxtStatus === 'blocked'
                      ? 'fail'
                      : 'warning'
                }
              />
              <InfoRow
                label="Sitemap"
                value={result.seo.hasSitemap ? 'Found' : 'Not found'}
                status={result.seo.hasSitemap ? 'pass' : 'warning'}
                helpText={
                  result.seo.hasSitemap
                    ? '/sitemap.xml exists'
                    : '/sitemap.xml not found'
                }
              />
            </div>
          )}

          {/* Social Tab */}
          {activeTab === 'social' && (
            <div className="space-y-6">
              {/* Preview Card */}
              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-2">
                    Social Media Preview
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    See how your link will appear when shared on social media
                    platforms
                  </p>
                </div>
                <div className="max-w-md">
                  <SocialPreview
                    title={
                      result.social.og.title ||
                      result.social.twitter.title ||
                      result.seo.title.value
                    }
                    description={
                      result.social.og.description ||
                      result.social.twitter.description ||
                      result.seo.description.value
                    }
                    image={
                      result.social.og.image || result.social.twitter.image
                    }
                    url={result.finalUrl}
                    domain={new URL(result.finalUrl).hostname}
                  />
                </div>
              </div>

              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-3">
                  Open Graph Details
                </h3>
                <div className="space-y-2">
                  <InfoRow
                    label="OG Title"
                    value={result.social.og.title || 'Not set'}
                    status={result.social.og.title ? 'pass' : 'warning'}
                  />
                  <InfoRow
                    label="OG Description"
                    value={result.social.og.description || 'Not set'}
                    status={result.social.og.description ? 'pass' : 'warning'}
                  />
                  <InfoRow
                    label="OG Image"
                    value={
                      result.social.og.image ? (
                        <a
                          href={result.social.og.image}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {result.social.og.image}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        'Not set'
                      )
                    }
                    status={result.social.og.image ? 'pass' : 'warning'}
                  />
                  <InfoRow
                    label="OG URL"
                    value={result.social.og.url || 'Not set'}
                    status={result.social.og.url ? 'pass' : 'warning'}
                  />
                  <InfoRow
                    label="OG Type"
                    value={result.social.og.type || 'Not set'}
                    status={result.social.og.type ? 'pass' : 'warning'}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">
                  Twitter Card Details
                </h3>
                <div className="space-y-2">
                  <InfoRow
                    label="Card Type"
                    value={result.social.twitter.card || 'Not set'}
                    status={result.social.twitter.card ? 'pass' : 'warning'}
                  />
                  <InfoRow
                    label="Twitter Title"
                    value={result.social.twitter.title || 'Not set'}
                    status={result.social.twitter.title ? 'pass' : 'warning'}
                  />
                  <InfoRow
                    label="Twitter Description"
                    value={result.social.twitter.description || 'Not set'}
                    status={
                      result.social.twitter.description ? 'pass' : 'warning'
                    }
                  />
                  <InfoRow
                    label="Twitter Image"
                    value={
                      result.social.twitter.image ? (
                        <a
                          href={result.social.twitter.image}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {result.social.twitter.image}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        'Not set'
                      )
                    }
                    status={result.social.twitter.image ? 'pass' : 'warning'}
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
                          : 'text-destructive',
                    )}
                  >
                    {result.technical.statusCode}
                  </span>
                }
                status={
                  result.technical.statusCode >= 200 &&
                  result.technical.statusCode < 300
                    ? 'pass'
                    : result.technical.statusCode >= 300 &&
                        result.technical.statusCode < 400
                      ? 'warning'
                      : 'fail'
                }
              />
              {result.technical.redirectChain.length > 0 && (
                <div>
                  <div className="font-medium mb-2">Redirect Chain</div>
                  <div className="space-y-2">
                    {result.technical.redirectChain.map((hop, i) => (
                      <div
                        key={hop.url}
                        className="flex items-center gap-2 text-sm p-2 bg-accent rounded"
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
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">Response Time Breakdown</h4>
                  <span
                    className={cn(
                      'text-lg font-bold',
                      result.technical.responseTime.total < 1000
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : result.technical.responseTime.total < 3000
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-destructive',
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
                  <div className="pt-2 border-t">
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
                value={result.technical.contentType}
                status="info"
              />
              <InfoRow
                label="Page Size"
                value={`${(result.technical.pageSize / 1024).toFixed(2)} KB`}
                status="info"
              />
              <InfoRow
                label="Server"
                value={result.technical.server || 'Not detected'}
                status="info"
              />
              {result.technical.ssl && (
                <InfoRow
                  label="SSL Certificate"
                  value={
                    <div>
                      <div>Issuer: {result.technical.ssl.issuer}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Expires:{' '}
                        {new Date(
                          result.technical.ssl.expires,
                        ).toLocaleDateString()}
                      </div>
                    </div>
                  }
                  status={result.technical.ssl.valid ? 'pass' : 'fail'}
                />
              )}
              {/* Server IP & Hosting Info */}
              {result.hosting.ip && (
                <FeatureCardContainer className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="size-5" />
                    <h4 className="font-semibold">Server IP & Hosting</h4>
                  </div>

                  <InfoRow
                    label="IP Address"
                    value={result.hosting.ip}
                    status="info"
                  />

                  {result.hosting.location && (
                    <InfoRow
                      label="Location"
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
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {result.hosting.location.latitude.toFixed(
                                      4,
                                    )}
                                    ,{' '}
                                    {result.hosting.location.longitude.toFixed(
                                      4,
                                    )}
                                  </div>
                                )}
                            </>
                          ) : (
                            result.hosting.location.country || 'Unknown'
                          )}
                        </div>
                      }
                      status="info"
                    />
                  )}

                  {result.hosting.isp && (
                    <InfoRow
                      label="ISP"
                      value={result.hosting.isp}
                      status="info"
                    />
                  )}

                  {result.hosting.asn && (
                    <InfoRow
                      label="ASN"
                      value={result.hosting.asn}
                      status="info"
                    />
                  )}

                  {result.hosting.organization && (
                    <InfoRow
                      label="Organization"
                      value={result.hosting.organization}
                      status="info"
                    />
                  )}

                  {result.hosting.cdn && (
                    <InfoRow
                      label="CDN"
                      value={result.hosting.cdn}
                      status="pass"
                    />
                  )}

                  <div className="pt-2 border-t text-xs text-muted-foreground space-y-2">
                    <div>
                      <strong>Location data:</strong> Powered by{' '}
                      <a
                        href="https://www.maxmind.com/en/geoip2-services-and-databases"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        MaxMind GeoLite2
                      </a>{' '}
                      database
                    </div>
                    {(result.hosting.isp || result.hosting.asn) && (
                      <div>
                        <strong>Network data:</strong> ISP/ASN information from{' '}
                        <a
                          href="https://ip-api.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
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
                  value="Not resolved"
                  status="warning"
                />
              )}
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <FeatureCardContainer className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="size-5" />
                  <span className="font-semibold">Security Score</span>
                </div>
                <div className="text-3xl font-bold">
                  {result.security.score}/100
                </div>
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all',
                      result.security.score >= 70
                        ? 'bg-emerald-600 dark:bg-emerald-400'
                        : result.security.score >= 40
                          ? 'bg-amber-600 dark:bg-amber-400'
                          : 'bg-destructive',
                    )}
                    style={{ width: `${result.security.score}%` }}
                  />
                </div>
              </FeatureCardContainer>

              <InfoRow
                label="Content-Security-Policy"
                value={result.security.csp || 'Not set'}
                status={result.security.csp ? 'pass' : 'fail'}
                helpText={
                  result.security.csp
                    ? 'CSP header is present'
                    : 'CSP header is missing'
                }
              />
              <InfoRow
                label="X-Frame-Options"
                value={result.security.xFrameOptions || 'Not set'}
                status={
                  result.security.xFrameOptions
                    ? result.security.xFrameOptions.toLowerCase() === 'deny' ||
                      result.security.xFrameOptions.toLowerCase() ===
                        'sameorigin'
                      ? 'pass'
                      : 'warning'
                    : 'fail'
                }
                helpText={
                  result.security.xFrameOptions
                    ? 'Protects against clickjacking'
                    : 'Missing X-Frame-Options header'
                }
              />
              <InfoRow
                label="X-Content-Type-Options"
                value={result.security.xContentTypeOptions || 'Not set'}
                status={
                  result.security.xContentTypeOptions?.toLowerCase() ===
                  'nosniff'
                    ? 'pass'
                    : result.security.xContentTypeOptions
                      ? 'warning'
                      : 'fail'
                }
                helpText={
                  result.security.xContentTypeOptions?.toLowerCase() ===
                  'nosniff'
                    ? 'Prevents MIME type sniffing'
                    : 'Missing or incorrect X-Content-Type-Options header'
                }
              />
              <InfoRow
                label="Strict-Transport-Security (HSTS)"
                value={result.security.hsts || 'Not set'}
                status={result.security.hsts ? 'pass' : 'warning'}
                helpText={
                  result.security.hsts
                    ? 'Forces HTTPS connections'
                    : 'HSTS header is missing (only applies to HTTPS sites)'
                }
              />
            </div>
          )}
        </div>
      )}

      {/* SEO Content Section */}
      <div className="mt-16 prose prose-neutral dark:prose-invert max-w-none">
        <article className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold mb-4">
              Free URL Checker & Website Analysis Tool
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              Check any URL for SEO issues, security problems, and performance
              bottlenecks. Our free site checker analyzes meta tags, social
              previews, security headers, and server configuration in seconds.
            </p>
          </div>

          <section>
            <h3 className="text-2xl font-semibold mb-4">
              What This URL Checker Analyzes
            </h3>
            <p className="mb-4">
              Paste any URL and get a complete breakdown of how the page
              performs across four critical areas:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
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
            <h3 className="text-2xl font-semibold mb-4">SEO Analysis</h3>

            <h4 className="text-xl font-semibold mt-6 mb-3">Title Tags</h4>
            <p className="mb-4">
              Title tags appear in search results and browser tabs. They're one
              of the strongest on-page ranking signals. Our URL checker verifies
              your title is:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
              <li>Between 30-60 characters (optimal for search display)</li>
              <li>Present and not empty</li>
              <li>Unique and descriptive</li>
            </ul>

            <h4 className="text-xl font-semibold mt-6 mb-3">
              Meta Descriptions
            </h4>
            <p className="mb-4">
              Meta descriptions don't directly affect rankings but significantly
              impact click-through rates. A good description is 120-160
              characters, includes a clear value proposition, and encourages
              clicks.
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">H1 Tags</h4>
            <p className="mb-4">
              Each page should have exactly one H1 tag that clearly describes
              the page content. Our checker flags missing H1s and helps ensure
              proper heading structure.
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">Canonical URLs</h4>
            <p className="mb-4">
              Canonical tags prevent duplicate content issues by telling search
              engines which URL version is authoritative. This matters for pages
              accessible via multiple URLs, parameter variations, or HTTP/HTTPS
              and www/non-www variants.
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">Indexability</h4>
            <p className="mb-4">
              The checker analyzes robots.txt rules and meta robots tags to
              determine if search engines can crawl and index your page. You'll
              see clear warnings if anything blocks indexing.
            </p>
          </section>

          <section>
            <h3 className="text-2xl font-semibold mb-4">
              Social Media Previews
            </h3>
            <p className="mb-4">
              When someone shares your URL on social media, Open Graph and
              Twitter Card tags control what appears. Without them, platforms
              guess—often poorly.
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">Open Graph Tags</h4>
            <p className="mb-4">
              Open Graph controls how links display on Facebook, LinkedIn, and
              most other platforms. Essential tags include:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
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

            <h4 className="text-xl font-semibold mt-6 mb-3">Twitter Cards</h4>
            <p className="mb-4">
              Twitter uses its own card format. Our site checker verifies:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
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
            <h3 className="text-2xl font-semibold mb-4">Performance Metrics</h3>
            <p className="mb-4">
              Page speed affects both user experience and search rankings. Our
              URL checker breaks down exactly where time is spent:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
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

            <h4 className="text-xl font-semibold mt-6 mb-3">
              Server Information
            </h4>
            <p className="mb-4">
              The checker also reveals hosting details: server IP and location,
              hosting provider, CDN detection (Cloudflare, Fastly, Vercel,
              etc.), and server software (Nginx, Apache).
            </p>
          </section>

          <section>
            <h3 className="text-2xl font-semibold mb-4">Security Analysis</h3>
            <p className="mb-4">
              Security headers protect your site and visitors from common
              attacks. Our checker evaluates four critical headers:
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">
              Content Security Policy (CSP)
            </h4>
            <p className="mb-4">
              CSP prevents cross-site scripting (XSS) by controlling which
              resources can load. It restricts scripts to trusted sources and
              blocks inline execution.
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">X-Frame-Options</h4>
            <p className="mb-4">
              Prevents clickjacking by controlling whether your page can be
              embedded in iframes. Set to DENY or SAMEORIGIN for protection.
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">
              X-Content-Type-Options
            </h4>
            <p className="mb-4">
              Set to <code>nosniff</code> to prevent browsers from MIME-type
              sniffing, which can lead to security vulnerabilities.
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">
              Strict-Transport-Security (HSTS)
            </h4>
            <p className="mb-4">
              Forces HTTPS connections, preventing protocol downgrade attacks.
              Essential for sites handling any sensitive data.
            </p>

            <h4 className="text-xl font-semibold mt-6 mb-3">SSL Certificate</h4>
            <p className="mb-4">
              The checker verifies your SSL certificate is valid, trusted, and
              not expiring soon. Expired certificates trigger browser warnings
              that destroy user trust.
            </p>
          </section>

          <section>
            <h3 className="text-2xl font-semibold mb-4">
              How to Use This Website Checker
            </h3>
            <ol className="list-decimal list-inside space-y-3 mb-6 ml-4">
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
            <h3 className="text-2xl font-semibold mb-4">
              Quick Optimization Checklist
            </h3>

            <h4 className="text-xl font-semibold mt-6 mb-3">SEO Essentials</h4>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
              <li>Unique title tag (30-60 characters) on every page</li>
              <li>Compelling meta description (120-160 characters)</li>
              <li>Single, descriptive H1 tag</li>
              <li>Canonical URL set correctly</li>
              <li>Page is indexable (no accidental noindex)</li>
            </ul>

            <h4 className="text-xl font-semibold mt-6 mb-3">Performance</h4>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
              <li>TTFB under 200ms</li>
              <li>Use a CDN for global reach</li>
              <li>Enable compression (gzip/brotli)</li>
              <li>Optimize images and enable caching</li>
            </ul>

            <h4 className="text-xl font-semibold mt-6 mb-3">Security</h4>
            <ul className="list-disc list-inside space-y-2 mb-6 ml-4">
              <li>Valid SSL certificate (not expiring soon)</li>
              <li>All four security headers configured</li>
              <li>HSTS enabled for HTTPS enforcement</li>
            </ul>
          </section>

          <section>
            <h3 className="text-2xl font-semibold mb-4">
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

          <section className="border-t pt-8 mt-8">
            <h3 className="text-2xl font-semibold mb-4">
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
