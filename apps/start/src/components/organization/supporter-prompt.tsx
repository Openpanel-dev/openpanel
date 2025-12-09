import { Button, LinkButton } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { useCookieStore } from '@/hooks/use-cookie-store';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AwardIcon,
  HeartIcon,
  type LucideIcon,
  MessageCircleIcon,
  RocketIcon,
  SparklesIcon,
  XIcon,
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
    <AnimatePresence>
      {!supporterPromptClosed && (
        <motion.div
          initial={{ opacity: 0, x: 100, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.95 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
          className="fixed bottom-0 right-0 z-50 p-4 max-w-md"
        >
          <div className="bg-card border p-6 rounded-lg shadow-lg col gap-4">
            <div>
              <div className="row items-center justify-between">
                <h2 className="text-xl font-semibold">Support OpenPanel</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setSupporterPromptClosed(true)}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Help us build the future of open analytics
              </p>
            </div>

            <div className="col gap-3">
              {PERKS.map((perk) => (
                <PerkPoint
                  key={perk.text}
                  icon={perk.icon}
                  text={perk.text}
                  description={perk.description}
                />
              ))}
            </div>

            <div className="pt-2">
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
