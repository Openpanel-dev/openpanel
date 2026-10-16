'use client';

import { motion } from 'framer-motion';
import { Section } from '@/components/section';
import type { CompareSummary } from '@/lib/compare';

interface WhoShouldChooseProps {
  summary: CompareSummary;
  competitorName: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
  },
};

export function WhoShouldChoose({
  summary,
  competitorName,
}: WhoShouldChooseProps) {
  const openpanelItems = summary.best_for_openpanel.slice(0, 3);
  const competitorItems = summary.best_for_competitor.slice(0, 3);

  return (
    <Section className="container">
      <div className="col mb-12 gap-4">
        <h2 className="font-semibold text-3xl md:text-4xl">{summary.title}</h2>
        <p className="max-w-3xl text-muted-foreground">{summary.intro}</p>
      </div>
      <motion.div
        className="grid gap-6 md:grid-cols-2"
        initial="hidden"
        variants={containerVariants}
        viewport={{ once: true, margin: '-100px' }}
        whileInView="visible"
      >
        {/* OpenPanel Card */}
        <motion.div
          className="col group relative gap-4 overflow-hidden rounded-2xl border bg-background p-6 transition-all duration-300 hover:border-emerald-500/30"
          variants={cardVariants}
        >
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br light:from-emerald-800/10 light:via-transparent light:to-green-900/10 opacity-100 blur-2xl transition-opacity duration-500 group-hover:opacity-150 dark:from-emerald-500/5 dark:via-transparent dark:to-green-500/5" />
          <div className="col relative z-10 gap-3">
            <div className="col gap-2">
              <h3 className="font-semibold text-xl">Choose OpenPanel if...</h3>
            </div>
            <div className="col mt-2 gap-2">
              {openpanelItems.map((item, index) => (
                <motion.div
                  className="row group/item items-start gap-2"
                  initial={{ opacity: 0, x: -10 }}
                  key={item}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, x: 0 }}
                >
                  <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 transition-transform duration-300 group-hover/item:scale-110 dark:bg-emerald-400">
                    <span className="font-bold text-[10px] text-white">
                      {index + 1}
                    </span>
                  </div>
                  <p className="flex-1 text-muted-foreground text-sm transition-colors duration-300 group-hover/item:text-foreground">
                    {item}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Competitor Card */}
        <motion.div
          className="col group relative gap-4 overflow-hidden rounded-2xl border bg-background p-6 transition-all duration-300 hover:border-orange-500/30"
          variants={cardVariants}
        >
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br light:from-orange-800/10 light:via-transparent light:to-amber-900/10 opacity-100 blur-2xl transition-opacity duration-500 group-hover:opacity-150 dark:from-orange-500/5 dark:via-transparent dark:to-amber-500/5" />
          <div className="col relative z-10 gap-3">
            <div className="col gap-2">
              <h3 className="font-semibold text-xl">
                Choose {competitorName} if...
              </h3>
            </div>
            <div className="col mt-2 gap-2">
              {competitorItems.map((item, index) => (
                <motion.div
                  className="row group/item items-start gap-2"
                  initial={{ opacity: 0, x: -10 }}
                  key={item}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, x: 0 }}
                >
                  <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-orange-600 transition-transform duration-300 group-hover/item:scale-110 dark:bg-orange-400">
                    <span className="font-bold text-[10px] text-white">
                      {index + 1}
                    </span>
                  </div>
                  <p className="flex-1 text-muted-foreground text-sm transition-colors duration-300 group-hover/item:text-foreground">
                    {item}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Section>
  );
}
