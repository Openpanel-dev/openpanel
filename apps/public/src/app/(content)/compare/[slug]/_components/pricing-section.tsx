'use client';

import { Section, SectionHeader } from '@/components/section';
import type { ComparePricing } from '@/lib/compare';
import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

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
        title={pricing.title}
        description={pricing.intro}
        variant="sm"
      />

      {/* Pricing comparison */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
        variants={containerVariants}
        className="grid md:grid-cols-2 gap-6 mt-12"
      >
        {/* OpenPanel Card */}
        <motion.div
          variants={cardVariants}
          className="col gap-4 p-6 rounded-2xl border bg-background group relative overflow-hidden hover:border-emerald-500/30 transition-all duration-300"
        >
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br opacity-100 blur-2xl dark:from-emerald-500/5 dark:via-transparent dark:to-green-500/5 light:from-emerald-800/10 light:via-transparent light:to-green-900/10 group-hover:opacity-150 transition-opacity duration-500" />
          <div className="col gap-3 relative z-10">
            <div className="col gap-2">
              <h3 className="text-xl font-semibold">OpenPanel</h3>
              <p className="text-sm text-muted-foreground font-medium">
                {pricing.openpanel.model}
              </p>
            </div>
            <div className="col gap-2 mt-2">
              {openpanelPoints.map((point, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="row gap-2 items-start group/item"
                >
                  <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 group-hover/item:scale-110 transition-transform duration-300" />
                  <p className="text-sm text-muted-foreground flex-1 group-hover/item:text-foreground transition-colors duration-300">
                    {point.trim()}
                  </p>
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="col gap-2 mt-2"
            >
              <div className="row gap-2 items-center p-3 rounded-lg bg-muted/30 border border-emerald-500/10">
                <span className="text-xs font-medium text-muted-foreground">
                  Free tier:
                </span>
                <span className="text-xs text-muted-foreground">
                  Self-hosting (unlimited events)
                </span>
              </div>
              <div className="row gap-2 items-center p-3 rounded-lg bg-muted/30 border border-emerald-500/10">
                <span className="text-xs font-medium text-muted-foreground">
                  Free trial:
                </span>
                <span className="text-xs text-muted-foreground">
                  30 days
                </span>
              </div>
            </motion.div>
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
              <h3 className="text-xl font-semibold">{competitorName}</h3>
              <p className="text-sm text-muted-foreground font-medium">
                {pricing.competitor.model}
              </p>
            </div>
            <div className="col gap-2 mt-2">
              {competitorPoints.map((point, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="row gap-2 items-start group/item"
                >
                  <CheckIcon className="size-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5 group-hover/item:scale-110 transition-transform duration-300" />
                  <p className="text-sm text-muted-foreground flex-1 group-hover/item:text-foreground transition-colors duration-300">
                    {point.trim()}
                  </p>
                </motion.div>
              ))}
            </div>
            {pricing.competitor.free_tier && (
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="row gap-2 items-center mt-2 p-3 rounded-lg bg-muted/30 border border-orange-500/10"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  Free tier:
                </span>
                <span className="text-xs text-muted-foreground">
                  {pricing.competitor.free_tier}
                </span>
              </motion.div>
            )}
            {pricing.competitor.pricing_url && (
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
              >
                <Link
                  href={pricing.competitor.pricing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="row gap-2 items-center text-xs text-primary hover:text-primary/80 transition-colors duration-300 mt-2 group/link"
                >
                  <span>View pricing</span>
                  <ArrowRightIcon className="size-3 group-hover/link:translate-x-1 transition-transform duration-300" />
                </Link>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Section>
  );
}

