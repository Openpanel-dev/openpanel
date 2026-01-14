import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';

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
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: 100, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.95 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
          className="fixed bottom-0 right-0 z-50 p-4 max-w-sm"
        >
          <div className="bg-card border rounded-lg shadow-[0_0_100px_50px_var(--color-background)] col gap-6 py-6 overflow-hidden">
            <div className="relative px-6 col gap-1">
              <div
                className="absolute -bottom-10 -right-10 h-64 w-64 rounded-full opacity-30 blur-3xl pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${gradientColor} 0%, transparent 70%)`,
                }}
              />
              <div className="row items-center justify-between">
                <h2 className="text-xl font-semibold max-w-[200px] leading-snug">
                  {title}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={onClose}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>

            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
