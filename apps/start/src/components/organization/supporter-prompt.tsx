import { PromptCard } from '@/components/organization/prompt-card';
import { LinkButton } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { useCookieStore } from '@/hooks/use-cookie-store';
import {
  AwardIcon,
  HeartIcon,
  type LucideIcon,
  MessageCircleIcon,
  RocketIcon,
  SparklesIcon,
  ZapIcon,
} from 'lucide-react';

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
    <div className="row gap-4 items-center">
      <Icon className="size-4" />
      <div className="flex-1 min-w-0 col gap-1.5">
        <h3 className="font-medium text-sm">{text}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function SupporterPrompt() {
  const { isSelfHosted } = useAppContext();
  const [supporterPromptClosed, setSupporterPromptClosed] = useCookieStore(
    'supporter-prompt-closed',
    false,
  );

  if (!isSelfHosted) {
    return null;
  }

  return (
    <PromptCard
      title="Support OpenPanel"
      subtitle="Help us build the future of open analytics"
      onClose={() => setSupporterPromptClosed(true)}
      show={!supporterPromptClosed}
      gradientColor="rgb(16 185 129)"
    >
      <div className="col gap-3 px-6">
        {PERKS.map((perk) => (
          <PerkPoint
            key={perk.text}
            icon={perk.icon}
            text={perk.text}
            description={perk.description}
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
        <p className="text-xs text-muted-foreground text-center mt-4">
          Starting at $20/month • Cancel anytime •{' '}
          <a
            href="https://openpanel.dev/supporter"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Learn more
          </a>
        </p>
      </div>
    </PromptCard>
  );
}
