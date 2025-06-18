import { baseOptions } from '@/app/layout.config';
import { MailIcon } from 'lucide-react';
import Link from 'next/link';
import { SingleSwirl } from './Swirls';
import { Logo } from './logo';
import { SectionHeader } from './section';
import { Tag } from './tag';
import { Button } from './ui/button';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <div className="mt-32">
      <section className="overflow-hidden relative bg-foreground dark:bg-background-dark text-background dark:text-foreground rounded-xl p-0 pb-32 pt-16 max-w-7xl mx-auto">
        <SingleSwirl className="pointer-events-none absolute top-0 bottom-0 left-0" />
        <SingleSwirl className="pointer-events-none rotate-180 absolute top-0 bottom-0 -right-0 opacity-50" />
        <div className="container center-center col">
          <SectionHeader
            tag={<Tag>Discover User Insights</Tag>}
            title="Effortless web & product analytics"
            description="Simplify your web & product analytics with our user-friendly platform. Collect, analyze, and optimize your data in minutes."
          />
          <Button size="lg" variant="secondary" asChild>
            <Link href="https://dashboard.openpanel.dev/onboarding">
              Get started today!
            </Link>
          </Button>
        </div>
      </section>

      <footer className="pt-32 text-sm relative overflow-hidden">
        <div className="absolute -bottom-20 md:-bottom-32 left-0 right-0 center-center opacity-5 pointer-events-none">
          <Logo className="w-[900px] shrink-0" />
        </div>
        <div className="container grid grid-cols-1 md:grid-cols-5 gap-12 md:gap-8 relative">
          <div>
            <Link href="/" className="row items-center font-medium">
              <Logo className="h-6" />
              {baseOptions.nav?.title}
            </Link>
          </div>

          <div className="col gap-3">
            <h3 className="font-medium">Useful links</h3>
            <ul className="gap-2 col text-muted-foreground">
              <li>
                <Link href="/pricing">Pricing</Link>
              </li>
              <li>
                <Link href="/about">About</Link>
              </li>
              <li>
                <Link href="/contact">Contact</Link>
              </li>
              <li>
                <Link href="/supporter">Become a supporter</Link>
              </li>
            </ul>
          </div>

          <div className="col gap-3 ">
            <h3 className="font-medium">Articles</h3>
            <ul className="gap-2 col text-muted-foreground">
              <li>
                <Link href="/articles/vs-mixpanel">OpenPanel vs Mixpanel</Link>
              </li>
              <li>
                <Link href="/articles/mixpanel-alternatives">
                  Mixpanel alternatives
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-2 md:items-end col gap-4">
            <div className="[&_svg]:size-6 row gap-4">
              <Link
                title="Go to GitHub"
                href="https://github.com/Openpanel-dev/openpanel"
                rel="noreferrer noopener nofollow"
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="fill-current"
                >
                  <title>GitHub</title>
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </Link>
              <Link
                title="Go to X"
                href="https://x.com/openpaneldev"
                rel="noreferrer noopener nofollow"
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="fill-current"
                >
                  <title>X</title>
                  <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H3.298Z" />
                </svg>
              </Link>
              <Link
                title="Join Discord"
                href="https://go.openpanel.dev/discord"
                rel="noreferrer noopener nofollow"
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="fill-current"
                >
                  <title>Discord</title>
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                </svg>
              </Link>
              <Link
                title="Send an email"
                href="mailto:hello@openpanel.dev"
                rel="noreferrer noopener nofollow"
              >
                <MailIcon className="size-6" />
              </Link>
            </div>

            <a
              target="_blank"
              href="https://status.openpanel.dev"
              className="row gap-2 items-center border rounded-full px-2 py-1 max-md:self-start"
              rel="noreferrer noopener nofollow"
            >
              <span>Operational</span>
              <div className="size-2 bg-emerald-500 rounded-full" />
            </a>
          </div>
        </div>

        <div className="text-muted-foreground border-t pt-4 mt-16 gap-8 relative bg-background/70 pb-32">
          <div className="container col md:row justify-between">
            <div>Copyright © {year} OpenPanel. All rights reserved.</div>
            <div className="col lg:row gap-2 md:gap-4">
              <Link href="/sitemap.xml">Sitemap</Link>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/cookies">Cookie Policy (just kidding)</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
