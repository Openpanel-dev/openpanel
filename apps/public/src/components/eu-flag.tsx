function star(cx: number, cy: number, outerR: number, innerR: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

const STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * 30 - 90) * (Math.PI / 180);
  return {
    x: 12 + 5 * Math.cos(angle),
    y: 8 + 5 * Math.sin(angle),
  };
});

export function EuFlag({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#003399" height="16" rx="1.5" width="24" />
      {STARS.map((s, i) => (
        <polygon
          // biome-ignore lint/suspicious/noArrayIndexKey: static data
          key={i}
          fill="#FFCC00"
          points={star(s.x, s.y, 1.1, 0.45)}
        />
      ))}
    </svg>
  );
}
