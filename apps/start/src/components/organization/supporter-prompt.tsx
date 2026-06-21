import {
  AwardIcon,
  HeartIcon,
  type LucideIcon,
  MessageCircleIcon,
  RocketIcon,
  SparklesIcon,
  ZapIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PromptCard } from '@/components/organization/prompt-card';
import { LinkButton } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { useCookieStore } from '@/hooks/use-cookie-store';

const PERKS = [
  {
    icon: RocketIcon,
    textKey: 'supporter_perk_docker_title',
    descriptionKey: 'supporter_perk_docker_description',
  },
  {
    icon: MessageCircleIcon,
    textKey: 'supporter_perk_support_title',
    descriptionKey: 'supporter_perk_support_description',
  },
  {
    icon: SparklesIcon,
    textKey: 'supporter_perk_requests_title',
    descriptionKey: 'supporter_perk_requests_description',
  },
  {
    icon: AwardIcon,
    textKey: 'supporter_perk_discord_role_title',
    descriptionKey: 'supporter_perk_discord_role_description',
  },
  {
    icon: ZapIcon,
    textKey: 'supporter_perk_early_access_title',
    descriptionKey: 'supporter_perk_early_access_description',
  },
  {
    icon: HeartIcon,
    textKey: 'supporter_perk_impact_title',
    descriptionKey: 'supporter_perk_impact_description',
  },
] as const;

function PerkPoint({
  icon: Icon,
  textKey,
  descriptionKey,
}: {
  icon: LucideIcon;
  textKey: string;
  descriptionKey: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="row items-center gap-4">
      <Icon className="size-4" />
      <div className="col min-w-0 flex-1 gap-1.5">
        <h3 className="font-medium text-sm">
          {t(`organization.${textKey}`)}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t(`organization.${descriptionKey}`)}
        </p>
      </div>
    </div>
  );
}

export default function SupporterPrompt() {
  const { t } = useTranslation();
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
      subtitle={t('organization.supporter_prompt_subtitle')}
      title={t('organization.supporter_prompt_title')}
    >
      <div className="col gap-3 px-6">
        {PERKS.map((perk) => (
          <PerkPoint
            descriptionKey={perk.descriptionKey}
            icon={perk.icon}
            key={perk.textKey}
            textKey={perk.textKey}
          />
        ))}
      </div>

      <div className="px-6">
        <LinkButton
          className="w-full"
          href="https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV"
        >
          {t('organization.supporter_prompt_cta')}
        </LinkButton>
        <p className="mt-4 text-center text-muted-foreground text-xs">
          {t('organization.supporter_prompt_footer')}{' '}
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://openpanel.dev/supporter"
            rel="noreferrer"
            target="_blank"
          >
            {t('organization.supporter_prompt_learn_more')}
          </a>
        </p>
      </div>
    </PromptCard>
  );
}
