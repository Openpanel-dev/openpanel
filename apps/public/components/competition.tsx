'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const brandConfig = {
  Mixpanel: '#7A59FF',
  'Google Analytics': '#E37400',
  Amplitude: '#00CF98',
} as const;

const words = Object.keys(brandConfig);

function useWordCycle(words: string[], interval: number, mounted: boolean) {
  const [index, setIndex] = useState(0);
  const [isInitial, setIsInitial] = useState(true);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    if (isInitial) {
      setIndex(Math.floor(Math.random() * words.length));
      setIsInitial(false);
      return;
    }

    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % words.length);
    }, interval);
    return () => clearInterval(timer);
  }, [words, interval, isInitial, mounted]);

  return words[index];
}

export function Competition() {
  const [mounted, setMounted] = useState(false);
  const word = useWordCycle(words, 2100, mounted);
  const color = brandConfig[word as keyof typeof brandConfig];

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span className="block truncate leading-tight -mt-1" style={{ color }}>
        {word}
      </span>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={word}
        className="block truncate leading-tight -mt-1"
        style={{ color }}
      >
        {word?.split('').map((char, index) => (
          <motion.span
            key={`${word}-${char}-${index.toString()}`}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{
              duration: 0.15,
              delay: index * 0.015,
              ease: 'easeOut',
            }}
            style={{ display: 'inline-block', whiteSpace: 'pre' }}
          >
            {char}
          </motion.span>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
