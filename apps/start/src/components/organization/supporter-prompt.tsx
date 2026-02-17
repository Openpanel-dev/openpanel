import {
  AwardIcon,
  HeartIcon,
  type LucideIcon,
  MessageCircleIcon,
  RocketIcon,
  SparklesIcon,
  ZapIcon,
} from 'lucide-react';
import { PromptCard } from '@/components/organization/prompt-card';
import { LinkButton } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { useCookieStore } from '@/hooks/use-cookie-store';

const PERKS = [
  {
    icon: RocketIcon,
    text: 'Latest Docker Images',
    description: 'Bleeding-edge builds on every commit',
  },
  {
    icon: MessageCircleIcon,
    text: 'Prioritized Support',
    description: 'Get help faster with priority Discord support',
  },
  {
    icon: SparklesIcon,
    text: 'Feature Requests',
    description: 'Your ideas get prioritized in our roadmap',
  },
  {
    icon: AwardIcon,
    text: 'Exclusive Discord Role',
    description: 'Special badge and recognition in our community',
  },
  {
    icon: ZapIcon,
    text: 'Early Access',
    description: 'Try new features before public release',
  },
  {
    icon: HeartIcon,
    text: 'Direct Impact',
    description: 'Your support directly funds development',
  },
] as const;

function PerkPoint({
  icon: Icon,
  text,
  description,
}: {
  icon: LucideIcon;
  text: string;
  description: string;
}) {
  return (
    <div className="row items-center gap-4">
      <Icon className="size-4" />
      <div className="col min-w-0 flex-1 gap-1.5">
        <h3 className="font-medium text-sm">{text}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </div>
  );
}

export default function SupporterPrompt() {
  const { isSelfHosted, isDemo } = useAppContext();
  const [supporterPromptClosed, setSupporterPromptClosed] = useCookieStore(
    'supporter-prompt-closed',
    false
  );

  if (!isSelfHosted || isDemo) {
    return null;
  }

  return (
    <PromptCard
      gradientColor="rgb(16 185 129)"
      onClose={() => setSupporterPromptClosed(true)}
      show={!supporterPromptClosed}
      subtitle="Help us build the future of open analytics"
      title="Support OpenPanel"
    >
      <div className="col gap-3 px-6">
        {PERKS.map((perk) => (
          <PerkPoint
            description={perk.description}
            icon={perk.icon}
            key={perk.text}
            text={perk.text}
          />
        ))}
      </div>

      <div className="px-6">
        <LinkButton
          className="w-full"
          href="https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV"
        >
          Become a Supporter
        </LinkButton>
        <p className="mt-4 text-center text-muted-foreground text-xs">
          Starting at $20/month • Cancel anytime •{' '}
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://openpanel.dev/supporter"
            rel="noreferrer"
            target="_blank"
          >
            Learn more
          </a>
        </p>
      </div>
    </PromptCard>
  );
}
