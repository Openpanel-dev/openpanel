import * as React from 'react';
import { FACES } from './faces';
import { stringHash } from './utils/hash';

// ============================================================================
// Types
// ============================================================================

export type Intensity3D = 'none' | 'subtle' | 'medium' | 'dramatic';
export type Variant = 'gradient' | 'solid';

export type ColorScheme = 'light' | 'dark' | 'auto';

export interface FacehashProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * String to generate a deterministic face from.
   * Same string always produces the same face.
   */
  name: string;

  /**
   * Size in pixels or CSS units.
   * @default 40
   */
  size?: number | string;

  /**
   * Background style.
   * - "gradient": Adds gradient overlay (default)
   * - "solid": Plain background color
   * @default "gradient"
   */
  variant?: Variant;

  /**
   * 3D effect intensity.
   * @default "dramatic"
   */
  intensity3d?: Intensity3D;

  /**
   * Enable hover interaction.
   * When true, face "looks straight" on hover.
   * @default true
   */
  interactive?: boolean;

  /**
   * Use Tailwind group-hover for hover detection.
   * When true, hover effect triggers when a parent with "group" class is hovered.
   * @default false
   */
  groupHover?: boolean;

  /**
   * Show first letter of name below the face.
   * @default true
   */
  showInitial?: boolean;

  /**
   * Hex color array for inline styles.
   * Use this OR colorClasses, not both.
   */
  colors?: string[];

  /**
   * Colors to use in light mode.
   * Used when colorScheme is "light" or "auto".
   */
  colorsLight?: string[];

  /**
   * Colors to use in dark mode.
   * Used when colorScheme is "dark" or "auto".
   */
  colorsDark?: string[];

  /**
   * Which color scheme to use.
   * - "light": Always use colorsLight
   * - "dark": Always use colorsDark
   * - "auto": Use CSS prefers-color-scheme media query
   * @default "auto"
   */
  colorScheme?: ColorScheme;

  /**
   * Tailwind class array for background colors.
   * Example: ["bg-pink-500 dark:bg-pink-600", "bg-blue-500 dark:bg-blue-600"]
   * Use this OR colors, not both.
   */
  colorClasses?: string[];

  /**
   * Custom gradient overlay class (Tailwind).
   * When provided, replaces the default pure CSS gradient.
   * Only used when variant="gradient".
   */
  gradientOverlayClass?: string;
}

// ============================================================================
// Constants
// ============================================================================

const INTENSITY_PRESETS = {
  none: {
    rotateRange: 0,
    translateZ: 0,
    perspective: 'none',
  },
  subtle: {
    rotateRange: 5,
    translateZ: 4,
    perspective: '800px',
  },
  medium: {
    rotateRange: 10,
    translateZ: 8,
    perspective: '500px',
  },
  dramatic: {
    rotateRange: 15,
    translateZ: 12,
    perspective: '300px',
  },
} as const;

const SPHERE_POSITIONS = [
  { x: -1, y: 1 }, // down-right
  { x: 1, y: 1 }, // up-right
  { x: 1, y: 0 }, // up
  { x: 0, y: 1 }, // right
  { x: -1, y: 0 }, // down
  { x: 0, y: 0 }, // center
  { x: 0, y: -1 }, // left
  { x: -1, y: -1 }, // down-left
  { x: 1, y: -1 }, // up-left
] as const;

// Default color palettes
export const DEFAULT_COLORS = [
  '#fce7f3', // pink-100
  '#fef3c7', // amber-100
  '#dbeafe', // blue-100
  '#d1fae5', // emerald-100
  '#ede9fe', // violet-100
  '#fee2e2', // red-100
  '#e0e7ff', // indigo-100
  '#ccfbf1', // teal-100
];

export const DEFAULT_COLORS_LIGHT = DEFAULT_COLORS;

export const DEFAULT_COLORS_DARK = [
  '#db2777', // pink-600
  '#d97706', // amber-600
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#dc2626', // red-600
  '#4f46e5', // indigo-600
  '#0d9488', // teal-600
];

// Default gradient as pure CSS (works without Tailwind)
const DEFAULT_GRADIENT_STYLE: React.CSSProperties = {
  background:
    'radial-gradient(ellipse 100% 100% at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 60%)',
};

// ============================================================================
// Component
// ============================================================================

/**
 * Facehash - Deterministic avatar faces from any string.
 */
/**
 * Hook to detect system color scheme preference
 */
function useColorScheme(colorScheme: ColorScheme): 'light' | 'dark' {
  const [systemScheme, setSystemScheme] = React.useState<'light' | 'dark'>(
    () => {
      if (typeof window === 'undefined') return 'light';
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    },
  );

  React.useEffect(() => {
    if (colorScheme !== 'auto') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemScheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [colorScheme]);

  if (colorScheme === 'auto') {
    return systemScheme;
  }
  return colorScheme;
}

export const Facehash = React.forwardRef<HTMLDivElement, FacehashProps>(
  (
    {
      name,
      size = 40,
      variant = 'gradient',
      intensity3d = 'dramatic',
      interactive = true,
      showInitial = true,
      colors,
      colorsLight,
      colorsDark,
      colorScheme = 'auto',
      colorClasses,
      gradientOverlayClass,
      groupHover = false,
      className,
      style,
      onMouseEnter,
      onMouseLeave,
      ...props
    },
    ref,
  ) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const resolvedScheme = useColorScheme(colorScheme);

    // For group-hover, we use CSS instead of JS state
    const usesCssHover = groupHover;

    // Determine which colors to use based on scheme
    const effectiveColors = React.useMemo(() => {
      // If explicit colors prop is provided, use it
      if (colors) return colors;
      // If colorClasses is provided, don't use inline colors
      if (colorClasses) return undefined;

      // Use scheme-specific colors or defaults
      const lightColors = colorsLight ?? DEFAULT_COLORS_LIGHT;
      const darkColors = colorsDark ?? DEFAULT_COLORS_DARK;

      return resolvedScheme === 'dark' ? darkColors : lightColors;
    }, [colors, colorClasses, colorsLight, colorsDark, resolvedScheme]);

    // Generate deterministic values from name
    const { FaceComponent, colorIndex, rotation } = React.useMemo(() => {
      const hash = stringHash(name);
      const faceIndex = hash % FACES.length;
      const colorsLength = colorClasses?.length ?? effectiveColors?.length ?? 1;
      const _colorIndex = hash % colorsLength;
      const positionIndex = hash % SPHERE_POSITIONS.length;
      const position = SPHERE_POSITIONS[positionIndex] ?? { x: 0, y: 0 };

      return {
        FaceComponent: FACES[faceIndex] ?? FACES[0],
        colorIndex: _colorIndex,
        rotation: position,
      };
    }, [name, effectiveColors?.length, colorClasses?.length]);

    // Get intensity preset
    const preset = INTENSITY_PRESETS[intensity3d];

    // Calculate 3D transforms
    const { baseTransform, hoverTransform } = React.useMemo(() => {
      if (intensity3d === 'none') {
        return { baseTransform: undefined, hoverTransform: undefined };
      }

      const rotateX = rotation.x * preset.rotateRange;
      const rotateY = rotation.y * preset.rotateRange;

      return {
        baseTransform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${preset.translateZ}px)`,
        hoverTransform: `rotateX(0deg) rotateY(0deg) translateZ(${preset.translateZ}px)`,
      };
    }, [intensity3d, rotation, preset]);

    // For JS-based hover, apply transform based on hover state
    const transform = React.useMemo(() => {
      if (usesCssHover || !interactive) {
        return baseTransform;
      }
      return isHovered ? hoverTransform : baseTransform;
    }, [usesCssHover, interactive, isHovered, baseTransform, hoverTransform]);

    // Size style
    const sizeValue = typeof size === 'number' ? `${size}px` : size;

    // Initial letter
    const initial = name.charAt(0).toUpperCase();

    // Background: either hex color (inline) or class
    const bgColorClass = colorClasses?.[colorIndex];
    const bgColorHex = effectiveColors?.[colorIndex];

    // Event handlers (only used for JS-based hover, not group-hover)
    const handleMouseEnter = React.useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (interactive && !usesCssHover) {
          setIsHovered(true);
        }
        onMouseEnter?.(e);
      },
      [interactive, usesCssHover, onMouseEnter],
    );

    const handleMouseLeave = React.useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (interactive && !usesCssHover) {
          setIsHovered(false);
        }
        onMouseLeave?.(e);
      },
      [interactive, usesCssHover, onMouseLeave],
    );

    return (
      <div
        ref={ref}
        role="img"
        aria-label={`Avatar for ${name}`}
        data-facehash-avatar=""
        className={`${bgColorClass ?? ''} ${className ?? ''}`}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: sizeValue,
          height: sizeValue,
          perspective: preset.perspective,
          color: 'currentColor',
          ...(bgColorHex && { backgroundColor: bgColorHex }),
          ...style,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {/* Gradient overlay */}
        {variant === 'gradient' && (
          <div
            className={gradientOverlayClass}
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              ...(gradientOverlayClass ? {} : DEFAULT_GRADIENT_STYLE),
            }}
            aria-hidden="true"
          />
        )}

        {/* Face container with 3D transform */}
        <div
          data-facehash-avatar-face=""
          className={
            usesCssHover && interactive
              ? 'group-hover:[transform:var(--facehash-hover-transform)]'
              : undefined
          }
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform,
            transition: interactive ? 'transform 0.2s ease-out' : undefined,
            transformStyle: 'preserve-3d',
            '--facehash-hover-transform': hoverTransform,
          } as React.CSSProperties}
        >
          {/* Face SVG */}
          <FaceComponent
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
            }}
          />

          {/* Initial letter */}
          {showInitial && (
            <span
              data-facehash-avatar-initial=""
              style={{
                position: 'relative',
                marginTop: '25%',
                fontSize: `calc(${sizeValue} * 0.35)`,
                fontWeight: 600,
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              {initial}
            </span>
          )}
        </div>
      </div>
    );
  },
);

Facehash.displayName = 'Facehash';
