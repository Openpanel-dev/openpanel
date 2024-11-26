interface GradientProps {
  percentage: number;
  baseColor: string;
  id: string;
}

export const SolidToDashedGradient: React.FC<GradientProps> = ({
  percentage,
  baseColor,
  id,
}) => {
  const stops = generateSolidToDashedLinearGradient(percentage, baseColor);

  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      {stops.map((stop, index) => (
        <stop
          key={index as any}
          offset={stop.offset}
          stopColor={stop.color}
          stopOpacity={stop.opacity}
        />
      ))}
    </linearGradient>
  );
};

// Helper function moved to the same file
const generateSolidToDashedLinearGradient = (
  percentage: number,
  baseColor: string,
) => {
  // Start with solid baseColor up to percentage
  const stops = [
    { offset: '0%', color: baseColor, opacity: 1 },
    { offset: `${percentage}%`, color: baseColor, opacity: 1 },
  ];

  // Calculate the remaining space for dashes
  const remainingSpace = 100 - percentage;
  const dashWidth = remainingSpace / 20; // 10 dashes = 20 segments (dash + gap)

  // Generate 10 dashes
  for (let i = 0; i < 10; i++) {
    const startOffset = percentage + i * 2 * dashWidth;

    // Add dash and gap with sharp transitions
    stops.push(
      // Start of dash
      { offset: `${startOffset}%`, color: baseColor, opacity: 1 },
      // End of dash
      { offset: `${startOffset + dashWidth}%`, color: baseColor, opacity: 1 },
      // Start of gap (immediate transition)
      {
        offset: `${startOffset + dashWidth}%`,
        color: 'transparent',
        opacity: 0,
      },
      // End of gap
      {
        offset: `${startOffset + 2 * dashWidth}%`,
        color: 'transparent',
        opacity: 0,
      },
    );
  }

  return stops;
};
