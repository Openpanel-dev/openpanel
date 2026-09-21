'use client';

import { AlertCircle, Globe, Loader2, MapPin, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FaqItem, Faqs } from '@/components/faq';
import { FeatureCardContainer } from '@/components/feature-card';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_URL } from '@/lib/api-url';
import { cn } from '@/lib/utils';

interface IPInfo {
  ip: string;
  location: {
    country: string | undefined;
    city: string | undefined;
    region: string | undefined;
    latitude: number | undefined;
    longitude: number | undefined;
  };
  isp: string | null;
  asn: string | null;
  organization: string | null;
  hostname: string | null;
  isLocalhost: boolean;
  isPrivate: boolean;
}

export default function IPLookupPage() {
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [result, setResult] = useState<IPInfo | null>(null);

  // Auto-detect IP on page load
  useEffect(() => {
    const detectIP = async () => {
      setAutoDetecting(true);
      try {
        const response = await fetch(`${API_URL}/tools/ip-lookup`);
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 429) {
            setIsRateLimited(true);
            throw new Error(
              'Rate limit exceeded. Please wait a minute before trying again.'
            );
          }
          setIsRateLimited(false);
          throw new Error(data.error || 'Failed to detect IP');
        }

        setIsRateLimited(false);
        setResult(data);
        setIp(data.ip);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to detect IP');
      } finally {
        setAutoDetecting(false);
      }
    };

    detectIP();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `${API_URL}/tools/ip-lookup?ip=${encodeURIComponent(ip.trim())}`
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
        throw new Error(data.error || 'Failed to lookup IP');
      }

      setIsRateLimited(false);

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const InfoCard = ({
    icon,
    label,
    value,
    className,
  }: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    className?: string;
  }) => (
    <FeatureCardContainer
      className={cn('flex items-start gap-3 p-4', className)}
    >
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 font-medium text-muted-foreground text-sm">
          {label}
        </div>
        <div className="break-words font-semibold text-base">
          {value || '—'}
        </div>
      </div>
    </FeatureCardContainer>
  );

  const getCountryFlag = (countryCode?: string): string => {
    if (!countryCode || countryCode.length !== 2) {
      return '🌐';
    }
    // Convert country code to flag emoji
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127_397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  return (
    <div className="max-w-4xl">
      <SectionHeader
        as="h1"
        description="Find detailed information about any IP address including geolocation, ISP, and network details."
        title="IP Lookup Tool"
        variant="default"
      />

      <form className="mt-8" onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <Input
            className="flex-1"
            onChange={(e) => setIp(e.target.value)}
            placeholder="Enter IP address or leave empty to detect yours"
            size="lg"
            type="text"
            value={ip}
          />
          <Button disabled={loading || autoDetecting} size="lg" type="submit">
            {loading || autoDetecting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {autoDetecting ? 'Detecting...' : 'Looking up...'}
              </>
            ) : (
              <>
                <Search className="size-4" />
                Lookup
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
                  You can make up to 20 requests per minute. Please try again
                  shortly.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          {/* IP Address Display */}
          <FeatureCardContainer>
            <div className="mb-2 flex items-center gap-3">
              <Globe className="size-6" />
              <div>
                <div className="text-muted-foreground text-sm">
                  {autoDetecting ? 'Detected IP Address' : 'IP Address'}
                </div>
                <div className="font-bold font-mono text-2xl">{result.ip}</div>
              </div>
            </div>
            {(result.isLocalhost || result.isPrivate) && (
              <div className="mt-3 flex items-center gap-2 text-muted-foreground text-sm">
                <AlertCircle className="size-4" />
                <span>
                  {result.isLocalhost
                    ? 'This is a localhost address'
                    : 'This is a private IP address'}
                </span>
              </div>
            )}
          </FeatureCardContainer>

          {/* Location Information */}
          {result.location.country && (
            <div>
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-lg">
                <MapPin className="size-5" />
                Location Information
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <InfoCard
                  icon={<Globe className="size-5" />}
                  label="Country"
                  value={
                    <span className="flex items-center gap-2">
                      <span className="text-2xl">
                        {getCountryFlag(result.location.country)}
                      </span>
                      <span>{result.location.country}</span>
                    </span>
                  }
                />
                {result.location.city && (
                  <InfoCard
                    icon={<MapPin className="size-5" />}
                    label="City"
                    value={result.location.city}
                  />
                )}
                {result.location.region && (
                  <InfoCard
                    icon={<MapPin className="size-5" />}
                    label="Region/State"
                    value={result.location.region}
                  />
                )}
                {result.location.latitude && result.location.longitude && (
                  <InfoCard
                    icon={<MapPin className="size-5" />}
                    label="Coordinates"
                    value={`${result.location.latitude.toFixed(4)}, ${result.location.longitude.toFixed(4)}`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Map Preview */}
          {result.location.latitude && result.location.longitude && (
            <div>
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-lg">
                <MapPin className="size-5" />
                Map Location
              </h3>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <iframe
                  className="aspect-video w-full"
                  frameBorder="0"
                  height="400"
                  marginHeight={0}
                  marginWidth={0}
                  scrolling="no"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${result.location.longitude - 0.1},${result.location.latitude - 0.1},${result.location.longitude + 0.1},${result.location.latitude + 0.1}&layer=mapnik&marker=${result.location.latitude},${result.location.longitude}`}
                  title="Map location"
                  width="100%"
                />
                <div className="flex items-center justify-between gap-4 border-border border-t bg-muted p-2 text-center text-muted-foreground text-xs">
                  <div>
                    ©{' '}
                    <a
                      className="text-primary hover:underline"
                      href="https://www.openstreetmap.org/copyright"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      OpenStreetMap
                    </a>{' '}
                    contributors
                  </div>
                  <a
                    className="text-primary hover:underline"
                    href={`https://www.openstreetmap.org/?mlat=${result.location.latitude}&mlon=${result.location.longitude}#map=12/${result.location.latitude}/${result.location.longitude}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View Larger Map
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Attribution */}
          <div className="space-y-2 border-t pt-4 text-muted-foreground text-xs">
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
            {(result.isp || result.asn) && (
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
        </div>
      )}

      {/* SEO Content Section */}
      <div className="prose prose-neutral dark:prose-invert mt-16 max-w-none">
        <article className="space-y-8">
          <div>
            <h2 className="mb-4 font-bold text-3xl">
              Free IP Lookup Tool - Find Your IP Address and Geolocation
            </h2>
            <p className="mb-6 text-lg text-muted-foreground">
              Discover your IP address instantly and get detailed geolocation
              information including country, city, ISP, ASN, and network
              details. Our free IP lookup tool provides accurate location data
              powered by MaxMind GeoLite2 database.
            </p>
          </div>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              What is an IP Address?
            </h3>
            <p className="mb-4">
              An IP (Internet Protocol) address is a unique numerical identifier
              assigned to every device connected to a computer network. Think of
              it as a mailing address for your device on the internet. There are
              two main types:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <strong>IPv4:</strong> The most common format, consisting of
                four numbers separated by dots (e.g., 192.168.1.1)
              </li>
              <li>
                <strong>IPv6:</strong> The newer format designed to replace
                IPv4, using hexadecimal notation (e.g.,
                2001:0db8:85a3:0000:0000:8a2e:0370:7334)
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              How IP Geolocation Works
            </h3>
            <p className="mb-4">
              IP geolocation determines the approximate physical location of an
              IP address by analyzing routing information and regional IP
              address allocations. Our tool uses:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <strong>MaxMind GeoLite2 Database:</strong> Industry-standard
                geolocation database providing accurate city and country-level
                data
              </li>
              <li>
                <strong>ISP Information:</strong> Internet Service Provider
                details from ip-api.com
              </li>
              <li>
                <strong>ASN Data:</strong> Autonomous System Number identifying
                the network operator
              </li>
              <li>
                <strong>Reverse DNS:</strong> Hostname lookup for additional
                network information
              </li>
            </ul>
            <p className="mb-4">
              <strong>Important Note:</strong> IP geolocation provides an
              approximate location, typically accurate to the city level. It
              shows where your ISP's network infrastructure is located, not
              necessarily your exact physical address.
            </p>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              Understanding IP Lookup Results
            </h3>

            <h4 className="mt-6 mb-3 font-semibold text-xl">Location Data</h4>
            <p className="mb-4">
              Our IP lookup provides detailed geographic information:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <strong>Country:</strong> The country where the IP address is
                registered or routed through
              </li>
              <li>
                <strong>City:</strong> The city-level location (when available)
              </li>
              <li>
                <strong>Region/State:</strong> State or province information
              </li>
              <li>
                <strong>Coordinates:</strong> Latitude and longitude for mapping
                purposes
              </li>
            </ul>

            <h4 className="mt-6 mb-3 font-semibold text-xl">
              Network Information
            </h4>
            <p className="mb-4">Technical details about the network:</p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <strong>ISP (Internet Service Provider):</strong> The company
                providing internet service for this IP address
              </li>
              <li>
                <strong>ASN (Autonomous System Number):</strong> A unique number
                identifying the network operator's routing domain
              </li>
              <li>
                <strong>Organization:</strong> The registered organization name
                for the IP address
              </li>
              <li>
                <strong>Hostname:</strong> Reverse DNS lookup result showing the
                domain name associated with the IP
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              Common Use Cases for IP Lookup
            </h3>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                <strong>Security:</strong> Identify suspicious login attempts or
                track potential security threats
              </li>
              <li>
                <strong>Content Localization:</strong> Display region-specific
                content based on user location
              </li>
              <li>
                <strong>Analytics:</strong> Understand where your website
                visitors are located
              </li>
              <li>
                <strong>Compliance:</strong> Ensure content restrictions based
                on geographic regulations
              </li>
              <li>
                <strong>Network Troubleshooting:</strong> Diagnose routing
                issues and network problems
              </li>
              <li>
                <strong>Fraud Prevention:</strong> Detect unusual patterns or
                verify user locations
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              Public vs Private IP Addresses
            </h3>
            <p className="mb-4">
              Understanding the difference between public and private IP
              addresses:
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">
              Public IP Address
            </h4>
            <p className="mb-4">
              A public IP address is assigned by your ISP and is visible to the
              internet. This is what websites see when you visit them. Our tool
              detects your public IP address automatically.
            </p>

            <h4 className="mt-6 mb-3 font-semibold text-xl">
              Private IP Address
            </h4>
            <p className="mb-4">
              Private IP addresses are used within local networks (home, office,
              etc.) and are not routable on the public internet. Common private
              IP ranges include:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>10.0.0.0 to 10.255.255.255</li>
              <li>172.16.0.0 to 172.31.255.255</li>
              <li>192.168.0.0 to 192.168.255.255</li>
              <li>127.0.0.1 (localhost)</li>
            </ul>
            <p className="mb-4">
              Our tool will indicate if an IP address is private or localhost.
            </p>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              Privacy and IP Addresses
            </h3>
            <p className="mb-4">
              Your IP address reveals some information about your location and
              network, but it doesn't expose your exact physical address or
              personal identity. Here's what you should know:
            </p>
            <ul className="mb-6 ml-4 list-inside list-disc space-y-2">
              <li>
                IP addresses show general location (city/region level), not
                exact addresses
              </li>
              <li>
                Your ISP assigns IP addresses, which may change periodically
              </li>
              <li>Using a VPN can mask your real IP address and location</li>
              <li>Websites can see your IP address when you visit them</li>
              <li>
                IP addresses alone cannot identify individual users without
                additional data
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              How to Use Our IP Lookup Tool
            </h3>
            <ol className="mb-6 ml-4 list-inside list-decimal space-y-3">
              <li>
                <strong>Auto-Detection:</strong> When you visit the page, your
                IP address is automatically detected and displayed
              </li>
              <li>
                <strong>Manual Lookup:</strong> Enter any IP address (IPv4 or
                IPv6) in the input field to look up its details
              </li>
              <li>
                <strong>View Results:</strong> See comprehensive information
                including location, ISP, ASN, and network details
              </li>
              <li>
                <strong>Map View:</strong> Click on the map preview to view the
                location on Google Maps
              </li>
            </ol>
          </section>

          <section>
            <h3 className="mb-4 font-semibold text-2xl">
              Frequently Asked Questions
            </h3>

            <Faqs>
              <FaqItem question="How accurate is IP geolocation?">
                IP geolocation is typically accurate to the city level, with
                accuracy varying by region. It shows where your ISP's network
                infrastructure is located, not your exact physical address.
              </FaqItem>

              <FaqItem question="Can I hide my IP address?">
                Yes, you can use a VPN (Virtual Private Network) or proxy
                service to mask your real IP address. This will show the VPN
                server's IP address instead of yours.
              </FaqItem>

              <FaqItem question="Why does my IP location seem wrong?">
                Your IP location reflects where your ISP's network equipment is
                located, which may be in a different city than your actual
                location. This is especially common with mobile networks or
                certain ISPs.
              </FaqItem>

              <FaqItem question="Is IP lookup free?">
                Yes, our IP lookup tool is completely free to use. We limit
                requests to 20 per minute per IP to ensure fair usage.
              </FaqItem>

              <FaqItem question="What is ASN?">
                ASN (Autonomous System Number) is a unique identifier for a
                network operator's routing domain on the internet. It helps
                identify which organization controls a particular IP address
                range.
              </FaqItem>
            </Faqs>
          </section>

          <section className="mt-8 border-t pt-8">
            <h3 className="mb-4 font-semibold text-2xl">
              Start Using Our Free IP Lookup Tool
            </h3>
            <p className="mb-6">
              Discover your IP address and explore detailed geolocation
              information instantly. Our tool automatically detects your IP when
              you visit, or you can look up any IP address manually. Get
              comprehensive network and location data powered by
              industry-leading databases.
            </p>
            <p className="text-muted-foreground">
              <strong>Tip:</strong> Bookmark this page to quickly check your IP
              address anytime. Useful for troubleshooting network issues or
              understanding your online presence.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
