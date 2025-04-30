// Sorry co.uk, but you're not a top domain

// Regex to check for IPv4 addresses
const IPV4_REGEX = /^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$/;

const parseCookieDomain = (url: string): { domain: string | undefined, secure: boolean } => {
  try {
    const urlObject = new URL(url);
    const hostname = urlObject.hostname;

    // If it's an IP address, don't set a domain attribute
    if (IPV4_REGEX.test(hostname) || hostname === 'localhost') { // Also handle localhost explicitly
      return {
        domain: undefined,
        secure: urlObject.protocol === 'https:',
      };
    }

    // Existing logic for domain names
    const domainParts = hostname.split('.');
    // Ensure at least two parts exist (e.g., example.com)
    const domain = domainParts.length > 1 ? domainParts.slice(-2).join('.') : hostname;

    return {
      domain: domain,
      secure: urlObject.protocol === 'https:',
    };
  } catch (e) {
    // Handle potential URL parsing errors, maybe default or log
    console.error("Error parsing cookie domain URL:", url, e);
    return { domain: undefined, secure: false }; // Default to no domain, insecure on error
  }
};

const parsed = parseCookieDomain(process.env.NEXT_PUBLIC_DASHBOARD_URL ?? '');

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const COOKIE_OPTIONS = {
  ...(parsed.domain && { domain: parsed.domain }), // Conditionally add domain only if it's defined
  secure: parsed.secure,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
} as const;
