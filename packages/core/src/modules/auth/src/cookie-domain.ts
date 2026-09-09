import type { CoreConfig } from '../../../config';

// List of known multi-part TLDs that should be treated as single domains
const MULTI_PART_TLDS = [
  /com\.\w{2}$/,
  /co\.\w{2}$/,
  /ac\.\w{2}$/,
  /net\.\w{2}$/,
  /org\.\w{2}$/,
  /gov\.\w{2}$/,
  /edu\.\w{2}$/,
  /nhs\.\w{2}$/,
  /or\.\w{2}$/,
  /go\.\w{2}$/,
];

function isMultiPartTLD(config: CoreConfig, potentialTLD: string): boolean {
  if (MULTI_PART_TLDS.some((pattern) => pattern.test(potentialTLD))) {
    return true;
  }

  return config.cookies.extraMultiPartTlds.includes(potentialTLD.toLowerCase());
}

export const parseCookieDomain = (config: CoreConfig, url: string) => {
  if (config.cookies.customDomain) {
    return {
      domain: config.cookies.customDomain,
      secure: true,
    };
  }

  if (!url) {
    return {
      domain: undefined,
      secure: false,
    };
  }

  const domain = new URL(url);
  const hostname = domain.hostname;

  // For localhost or IP addresses, don't set domain
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return {
      domain: undefined,
      secure: domain.protocol === 'https:',
    };
  }

  const parts = hostname.split('.');

  // Handle multi-part TLDs like co.uk, com.au, etc.
  if (parts.length >= 3) {
    const potentialTLD = parts.slice(-2).join('.');
    if (isMultiPartTLD(config, potentialTLD)) {
      // For domains like example.co.uk or subdomain.example.co.uk
      // Use the last 3 parts: .example.co.uk
      return {
        domain: `.${parts.slice(-3).join('.')}`,
        secure: domain.protocol === 'https:',
      };
    }
  }

  // For regular subdomains, use the last 2 parts
  if (parts.length > 2) {
    return {
      domain: `.${parts.slice(-2).join('.')}`,
      secure: domain.protocol === 'https:',
    };
  }

  // For root domains, use the full domain with leading dot
  return {
    domain: `.${hostname}`,
    secure: domain.protocol === 'https:',
  };
};
