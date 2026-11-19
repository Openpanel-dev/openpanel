import Link from 'next/link';
import { FeatureCardContainer } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Button } from '@/components/ui/button';

const ONBOARDING_URL = 'https://dashboard.openpanel.dev/onboarding';
const CLICK_EVENT = 'article_cta_click';

interface ArticleCtaLink {
  text: string;
  href: string;
}

export function ArticleCta({
  id,
  title,
  description,
  primary = { text: 'Start free trial', href: ONBOARDING_URL },
  secondary,
}: {
  /** Identifies this placement in the click event, e.g. "self-hosted-mid". */
  id: string;
  title: string;
  description: string;
  primary?: ArticleCtaLink;
  secondary?: ArticleCtaLink;
}) {
  return (
    <FeatureCardContainer className="not-prose my-10 gap-4">
      <div className="col gap-2">
        <span className="font-semibold text-lg">{title}</span>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="row flex-wrap items-center gap-3">
        <GetStartedButton
          data-cta={id}
          data-cta-target="primary"
          data-track={CLICK_EVENT}
          href={primary.href}
          text={primary.text}
        />
        {secondary && (
          <Button asChild size="lg" variant="outline">
            <Link
              data-cta={id}
              data-cta-target="secondary"
              data-track={CLICK_EVENT}
              href={secondary.href}
            >
              {secondary.text}
            </Link>
          </Button>
        )}
      </div>
    </FeatureCardContainer>
  );
}
