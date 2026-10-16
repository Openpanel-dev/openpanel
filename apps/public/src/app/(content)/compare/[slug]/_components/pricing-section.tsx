'use client';

import { motion } from 'framer-motion';
import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import Link from 'next/link';
import { Section, SectionHeader } from '@/components/section';
import type { ComparePricing } from '@/lib/compare';

interface PricingSectionProps {
  pricing: ComparePricing;
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

function parseDescription(description: string) {
  // Split by periods followed by space and capital letter, or by newlines
  const sentences = description
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .filter((s) => s.trim().length > 0);
  return sentences;
}

export function PricingSection({
  pricing,
  competitorName,
}: PricingSectionProps) {
  const openpanelPoints = parseDescription(pricing.openpanel.description);
  const competitorPoints = parseDescription(pricing.competitor.description);

  return (
    <Section className="container">
      <SectionHeader
        description={pricing.intro}
        title={pricing.title}
        variant="sm"
      />

      {/* Pricing comparison */}
      <motion.div
        className="mt-12 grid gap-6 md:grid-cols-2"
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
              <h3 className="font-semibold text-xl">OpenPanel</h3>
              <p className="font-medium text-muted-foreground text-sm">
                {pricing.openpanel.model}
              </p>
            </div>
            <div className="col mt-2 gap-2">
              {openpanelPoints.map((point, index) => (
                <motion.div
                  className="row group/item items-start gap-2"
                  initial={{ opacity: 0, x: -10 }}
                  key={index}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, x: 0 }}
                >
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 transition-transform duration-300 group-hover/item:scale-110 dark:text-emerald-400" />
                  <p className="flex-1 text-muted-foreground text-sm transition-colors duration-300 group-hover/item:text-foreground">
                    {point.trim()}
                  </p>
                </motion.div>
              ))}
            </div>
            <motion.div
              className="col mt-2 gap-2"
              initial={{ opacity: 0 }}
              transition={{ delay: 0.3 }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1 }}
            >
              <div className="row items-center gap-2 rounded-lg border border-emerald-500/10 bg-muted/30 p-3">
                <span className="font-medium text-muted-foreground text-xs">
                  Free tier:
                </span>
                <span className="text-muted-foreground text-xs">
                  Self-hosting (unlimited events)
                </span>
              </div>
              <div className="row items-center gap-2 rounded-lg border border-emerald-500/10 bg-muted/30 p-3">
                <span className="font-medium text-muted-foreground text-xs">
                  Free trial:
                </span>
                <span className="text-muted-foreground text-xs">30 days</span>
              </div>
            </motion.div>
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
              <h3 className="font-semibold text-xl">{competitorName}</h3>
              <p className="font-medium text-muted-foreground text-sm">
                {pricing.competitor.model}
              </p>
            </div>
            <div className="col mt-2 gap-2">
              {competitorPoints.map((point, index) => (
                <motion.div
                  className="row group/item items-start gap-2"
                  initial={{ opacity: 0, x: -10 }}
                  key={index}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, x: 0 }}
                >
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-orange-600 transition-transform duration-300 group-hover/item:scale-110 dark:text-orange-400" />
                  <p className="flex-1 text-muted-foreground text-sm transition-colors duration-300 group-hover/item:text-foreground">
                    {point.trim()}
                  </p>
                </motion.div>
              ))}
            </div>
            {pricing.competitor.free_tier && (
              <motion.div
                className="row mt-2 items-center gap-2 rounded-lg border border-orange-500/10 bg-muted/30 p-3"
                initial={{ opacity: 0 }}
                transition={{ delay: 0.3 }}
                viewport={{ once: true }}
                whileInView={{ opacity: 1 }}
              >
                <span className="font-medium text-muted-foreground text-xs">
                  Free tier:
                </span>
                <span className="text-muted-foreground text-xs">
                  {pricing.competitor.free_tier}
                </span>
              </motion.div>
            )}
            {pricing.competitor.pricing_url && (
              <motion.div
                initial={{ opacity: 0 }}
                transition={{ delay: 0.4 }}
                viewport={{ once: true }}
                whileInView={{ opacity: 1 }}
              >
                <Link
                  className="row group/link mt-2 items-center gap-2 text-primary text-xs transition-colors duration-300 hover:text-primary/80"
                  href={pricing.competitor.pricing_url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span>View pricing</span>
                  <ArrowRightIcon className="size-3 transition-transform duration-300 group-hover/link:translate-x-1" />
                </Link>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Section>
  );
}
