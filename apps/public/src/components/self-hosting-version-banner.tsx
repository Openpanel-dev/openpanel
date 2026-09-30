import Link from 'next/link';

const V2_GET_STARTED = '/docs/self-hosting/v2/get-started';
const V3_GET_STARTED = '/docs/self-hosting/self-hosting';
const SUPPORTER_DOCS =
  '/docs/self-hosting/supporter-access-latest-docker-images';

interface BannerContent {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  action: { label: string; href: string };
  tone: string;
}

// OpenPanel 3 reaches supporters first while the public release is still 2.x,
// and the two install differently, so every self-hosting page says which one
// it describes, loudly enough that nobody follows the wrong one.
const CONTENT: Record<'latest' | 'v2', BannerContent> = {
  latest: {
    eyebrow: 'OpenPanel 3 · for supporters',
    title: 'These docs describe OpenPanel 3',
    body: (
      <>
        OpenPanel 3 and the new <code>openpanel</code> CLI are available to{' '}
        <Link className="underline" href={SUPPORTER_DOCS}>
          supporters
        </Link>{' '}
        ahead of the public release. Running the public release (2.x)? Its
        instructions are different.
      </>
    ),
    action: { label: 'Show the 2.x instructions →', href: V2_GET_STARTED },
    tone: 'border-amber-500/50 bg-amber-500/10',
  },
  v2: {
    eyebrow: 'OpenPanel 2.x · public release',
    title: 'You are reading the 2.x instructions',
    body: (
      <>
        These pages describe the current public release, which you install and
        update with the scripts in the <code>self-hosting</code> folder.
        OpenPanel 3 uses the new <code>openpanel</code> CLI instead.
      </>
    ),
    action: {
      label: 'Show the OpenPanel 3 instructions →',
      href: V3_GET_STARTED,
    },
    tone: 'border-sky-500/50 bg-sky-500/10',
  },
};

export function SelfHostingVersionBanner({
  version = 'latest',
}: {
  version?: 'latest' | 'v2';
}) {
  const content = CONTENT[version];
  return (
    <aside
      aria-label={content.title}
      className={`not-prose my-6 rounded-xl border-2 p-5 ${content.tone}`}
    >
      <p className="font-medium text-fd-muted-foreground text-xs uppercase tracking-wide">
        {content.eyebrow}
      </p>
      <p className="mt-1 font-semibold text-fd-foreground text-lg">
        {content.title}
      </p>
      <p className="mt-2 text-fd-foreground text-sm leading-relaxed">
        {content.body}
      </p>
      <Link
        className="mt-4 inline-flex items-center rounded-lg bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground text-sm hover:opacity-90"
        href={content.action.href}
      >
        {content.action.label}
      </Link>
    </aside>
  );
}
