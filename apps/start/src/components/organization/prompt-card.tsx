import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface PromptCardProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  gradientColor?: string;
  show: boolean;
}

export function PromptCard({
  title,
  subtitle,
  onClose,
  children,
  gradientColor = 'rgb(16 185 129)',
  show,
}: PromptCardProps) {
  // `show` comes from a cookie, which the server can read, so this card can
  // render during SSR. framer writes its `initial` transform and opacity into
  // the style attribute and the client's first frame differs, so React throws
  // the tree away. Waiting for mount keeps the slide-in —
  // `initial={false}` would have removed it — and costs nothing, since the
  // card is a popup nobody expects in the server-rendered HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <AnimatePresence>
      {show && mounted && (
        <motion.div
          animate={{ opacity: 1, x: 0, scale: 1 }}
          className="fixed right-0 bottom-0 z-50 max-w-sm p-4"
          exit={{ opacity: 0, x: 100, scale: 0.95 }}
          initial={{ opacity: 0, x: 100, scale: 0.95 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
        >
          <div className="col gap-6 overflow-hidden rounded-lg border bg-card py-6 shadow-[0_0_100px_50px_var(--color-background)]">
            <div className="col relative gap-1 px-6">
              <div
                className="pointer-events-none absolute -right-10 -bottom-10 h-64 w-64 rounded-full opacity-30 blur-3xl"
                style={{
                  background: `radial-gradient(circle, ${gradientColor} 0%, transparent 70%)`,
                }}
              />
              <div className="row items-center justify-between">
                <h2 className="max-w-[200px] font-semibold text-xl leading-snug">
                  {title}
                </h2>
                <Button
                  className="rounded-full"
                  onClick={onClose}
                  size="icon"
                  variant="ghost"
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">{subtitle}</p>
            </div>

            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
