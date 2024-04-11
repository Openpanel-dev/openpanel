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
    ...colors.flatMap((color) =>
      ['text', 'bg'].map((prefix) => `${prefix}-chart-${color}`)
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
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        slate: {
          50: 'hsl(var(--slate-50))',
          100: 'hsl(var(--slate-100))',
          200: 'hsl(var(--slate-200))',
          300: 'hsl(var(--slate-300))',
          400: 'hsl(var(--slate-400))',
          500: 'hsl(var(--slate-500))',
          600: 'hsl(var(--slate-600))',
          700: 'hsl(var(--slate-700))',
          800: 'hsl(var(--slate-800))',
          900: 'hsl(var(--slate-900))',
          950: 'hsl(var(--slate-950))',
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
  plugins: [require('tailwindcss-animate')],
};

export default config;
