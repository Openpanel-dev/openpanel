'use client';

import { Section } from '@/components/section';
import type { CompareSummary } from '@/lib/compare';
import { motion } from 'framer-motion';

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
      <div className="col gap-4 mb-12">
        <h2 className="text-3xl md:text-4xl font-semibold">{summary.title}</h2>
        <p className="text-muted-foreground max-w-3xl">{summary.intro}</p>
      </div>
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
        variants={containerVariants}
        className="grid md:grid-cols-2 gap-6"
      >
        {/* OpenPanel Card */}
        <motion.div
          variants={cardVariants}
          className="col gap-4 p-6 rounded-2xl border bg-background group relative overflow-hidden hover:border-emerald-500/30 transition-all duration-300"
        >
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br opacity-100 blur-2xl dark:from-emerald-500/5 dark:via-transparent dark:to-green-500/5 light:from-emerald-800/10 light:via-transparent light:to-green-900/10 group-hover:opacity-150 transition-opacity duration-500" />
          <div className="col gap-3 relative z-10">
            <div className="col gap-2">
              <h3 className="text-xl font-semibold">Choose OpenPanel if...</h3>
            </div>
            <div className="col gap-2 mt-2">
              {openpanelItems.map((item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="row gap-2 items-start group/item"
                >
                  <div className="size-4 rounded-full bg-emerald-600 dark:bg-emerald-400 shrink-0 mt-0.5 flex items-center justify-center group-hover/item:scale-110 transition-transform duration-300">
                    <span className="text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground flex-1 group-hover/item:text-foreground transition-colors duration-300">
                    {item}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Competitor Card */}
        <motion.div
          variants={cardVariants}
          className="col gap-4 p-6 rounded-2xl border bg-background group relative overflow-hidden hover:border-orange-500/30 transition-all duration-300"
        >
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br opacity-100 blur-2xl dark:from-orange-500/5 dark:via-transparent dark:to-amber-500/5 light:from-orange-800/10 light:via-transparent light:to-amber-900/10 group-hover:opacity-150 transition-opacity duration-500" />
          <div className="col gap-3 relative z-10">
            <div className="col gap-2">
              <h3 className="text-xl font-semibold">
                Choose {competitorName} if...
              </h3>
            </div>
            <div className="col gap-2 mt-2">
              {competitorItems.map((item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="row gap-2 items-start group/item"
                >
                  <div className="size-4 rounded-full bg-orange-600 dark:bg-orange-400 shrink-0 mt-0.5 flex items-center justify-center group-hover/item:scale-110 transition-transform duration-300">
                    <span className="text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground flex-1 group-hover/item:text-foreground transition-colors duration-300">
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
