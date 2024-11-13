'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { WorldMap } from './world-map';

export function HeroMap() {
  const { scrollY } = useScroll();

  const y = useTransform(scrollY, [0, 250], [0, 50], { clamp: true });
  const scale = useTransform(scrollY, [0, 250], [1, 1.1], { clamp: true });

  return (
    <motion.div
      style={{ y, scale }}
      className="absolute inset-0 top-20 center-center items-start select-none"
    >
      <div className="min-w-[1400px] w-full">
        <WorldMap />
      </div>
    </motion.div>
  );
}
