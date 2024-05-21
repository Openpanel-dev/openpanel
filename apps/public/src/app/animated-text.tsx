'use client';

import { useMemo, useState } from 'react';
import { TypeAnimation } from 'react-type-animation';

type Props = {
  className?: string;
  texts: { text: string; color: string }[];
};

const AnimatedText = ({ texts }: Props) => {
  const [currIndex, setCurrIndex] = useState(0);
  const sequence = useMemo(() => {
    return texts.reduce((acc, { text }, index) => {
      return [
        ...acc,
        () => setCurrIndex(index),
        text,
        index === 0 ? 3000 : 2000,
      ];
    }, [] as any[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span
      style={{
        color: texts[currIndex]?.color,
        height: 60,
        display: 'block',
        whiteSpace: 'nowrap',
      }}
    >
      <TypeAnimation
        cursor={false}
        preRenderFirstString={true}
        sequence={sequence}
        wrapper="span"
        repeat={Infinity}
        omitDeletionAnimation
      />
    </span>
  );
};

export default AnimatedText;
