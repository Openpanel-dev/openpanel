const colors = [
  '#2563EB',
  '#ff7557',
  '#7fe1d8',
  '#f8bc3c',
  '#b3596e',
  '#72bef4',
  '#ffb27a',
  '#0f7ea0',
  '#3ba974',
  '#febbb2',
  '#cb80dc',
  '#5cb7af',
  '#7856ff',
];

const twColors = [
  'rose',
  'pink',
  'fuchsia',
  'purple',
  'violet',
  'indigo',
  'blue',
  'sky',
  'cyan',
  'teal',
  'emerald',
  'green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'red',
  'stone',
  'neutral',
  'zinc',
  'grey',
  'slate',
];
const twColorVariants = ['50', '100', '200', '700', '800', '900'];

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: 'class',
  safelist: [
    ...[...new Array(12)].flatMap((_, index) =>
      ['text', 'bg'].map((prefix) => `${prefix}-chart-${index}`),
    ),
    ...twColors.flatMap((color) => {
      return twColorVariants.flatMap((variant) => {
        return [
          `text-${color}-${variant}`,
          `bg-${color}-${variant}`,
          `hover:bg-${color}-${variant}`,
          `border-${color}-${variant}`,
          `dark:bg-${color}-${variant}`,
          `dark:hover:bg-${color}-${variant}`,
        ];
      });
    }),
  ],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    fontFamily: {
      sans: ['var(--font-geist-sans)'],
      mono: ['var(--font-geist-mono)'],
    },
    fontSize: {
      xs: ['10px', '10px'],
      sm: ['12px', '12px'],
      base: ['14px', '14px'],
      lg: ['16px', '16px'],
      xl: ['18px', '18px'],
      '2xl': ['20px', '20px'],
      '3xl': ['24px', '24px'],
      '4xl': ['30px', '30px'],
      '5xl': ['36px', '36px'],
      '6xl': ['48px', '48px'],
      '7xl': ['64px', '64px'],
      '8xl': ['72px', '72px'],
      '9xl': ['96px', '96px'],
    },
    extend: {
      colors: {
        'chart-0': 'var(--chart-0)',
        'chart-1': 'var(--chart-1)',
        'chart-2': 'var(--chart-2)',
        'chart-3': 'var(--chart-3)',
        'chart-4': 'var(--chart-4)',
        'chart-5': 'var(--chart-5)',
        'chart-6': 'var(--chart-6)',
        'chart-7': 'var(--chart-7)',
        'chart-8': 'var(--chart-8)',
        'chart-9': 'var(--chart-9)',
        'chart-10': 'var(--chart-10)',
        'chart-11': 'var(--chart-11)',
        'chart-12': 'var(--chart-12)',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        'def-100': 'hsl(var(--def-100))',
        'def-200': 'hsl(var(--def-200))',
        'def-300': 'hsl(var(--def-300))',
        'def-400': 'hsl(var(--def-400))',
        'def-500': 'hsl(var(--def-500))',
        'def-600': 'hsl(var(--def-600))',
        highlight: {
          DEFAULT: 'hsl(var(--highlight))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        ...colors.reduce((acc, color, index) => {
          return {
            ...acc,
            [`chart-${index}`]: color,
          };
        }, {}),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        DEFAULT: '0 5px 10px rgb(0 0 0 / 5%)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0px' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0px' },
        },
        wiggle: {
          '0%': { transform: 'rotate(0deg)' },
          '80%': { transform: 'rotate(0deg)' },
          '85%': { transform: 'rotate(5deg)' },
          '95%': { transform: 'rotate(-5deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        wiggle: 'wiggle 2.5s ease-in-out infinite',
        'ping-slow': 'ping 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
  ],
};

export default config;
