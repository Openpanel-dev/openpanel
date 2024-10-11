import Image from 'next/image';
import { useRouter } from 'next/router';
import { useConfig } from 'nextra-theme-docs';

export default {
  banner: {
    key: '1.0-release',
    text: (
      <a href="/docs/migration/beta-v1">
        🎉 We have released v1. Read migration guide if needed!
      </a>
    ),
  },
  logo: (
    <>
      <Image
        src="https://dashboard.openpanel.dev/logo.svg"
        alt="next-international logo"
        height="32"
        width="32"
      />
      <strong style={{ marginLeft: '8px' }}>OpenPanel</strong>
    </>
  ),
  head: () => {
    const router = useRouter();
    const config = useConfig();
    const title = config.title;
    const description = 'An open-source alternative to Mixpanel';
    const domain = 'https://docs.openpanel.dev';
    const canonicalUrl =
      `${domain}${router.asPath === '/' ? '' : router.asPath}`.split('?')[0];

    return (
      <>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta property="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:site:domain"
          content={domain.replace('https://', '')}
        />
        <meta name="twitter:url" content={domain} />
        <meta name="og:type" content={'site'} />
        <meta name="og:url" content={canonicalUrl} />
        <meta name="og:title" content={`${title} - Openpanel Docs`} />
        <meta property="og:description" content={description} />
        <meta
          name="og:image"
          content={'https://docs.openpanel.dev/ogimage.png'}
        />
        <meta name="title" content={title} />
        <meta name="description" content={description} />
      </>
    );
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s - Openpanel Docs',
    };
  },
  search: {
    placeholder: 'Search',
  },
  project: {
    link: 'https://github.com/openpanel-dev/openpanel',
  },
  docsRepositoryBase:
    'https://github.com/openpanel-dev/openpanel/blob/main/apps/docs',
  footer: {
    text: (
      <span>
        Made with ❤️ by{' '}
        <a
          href="https://x.com/OpenPanelDev"
          target="_blank"
          rel="noreferrer nofollow"
        >
          Carl
        </a>
      </span>
    ),
  },
};
