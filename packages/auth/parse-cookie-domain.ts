// List of known multi-part TLDs that should be treated as single domains
const MULTI_PART_TLDS = [
  'co.uk',
  'com.au',
  'co.za',
  'co.nz',
  'co.jp',
  'co.kr',
  'co.in',
  'co.il',
  'com.br',
  'com.mx',
  'com.ar',
  'com.pe',
  'com.cl',
  'com.co',
  'com.ve',
  'net.au',
  'org.au',
  'gov.au',
  'edu.au',
  'net.nz',
  'org.nz',
  'gov.nz',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'nhs.uk',
  'org.za',
  'gov.za',
  'ac.za',
  'ac.jp',
  'or.jp',
  'go.jp',
  'or.kr',
  'go.kr',
  'org.in',
  'gov.in',
  'ac.in',
  'org.il',
  'gov.il',
  'ac.il',
  'net.br',
  'org.br',
  'gov.br',
  'net.mx',
  'org.mx',
  'gov.mx',
  'net.ar',
  'org.ar',
  'gov.ar',
  'net.pe',
  'org.pe',
  'gov.pe',
  'net.cl',
  'org.cl',
  'gov.cl',
  'net.co',
  'org.co',
  'gov.co',
  'net.ve',
  'org.ve',
  'gov.ve',
];

export const parseCookieDomain = (url: string) => {
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
    if (MULTI_PART_TLDS.includes(potentialTLD)) {
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
