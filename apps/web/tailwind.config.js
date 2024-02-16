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

/** @type {import('tailwindcss').Config} */
const config = {
  safelist: [
    ...colors.flatMap((color) =>
      ['text', 'bg'].map((prefix) => `${prefix}-chart-${color}`)
    ),
    'bg-rose-200',
    'text-rose-700',
    'bg-pink-200',
    'text-pink-700',
    'bg-fuchsia-200',
    'text-fuchsia-700',
    'bg-purple-200',
    'text-purple-700',
    'bg-violet-200',
    'text-violet-700',
    'bg-indigo-200',
    'text-indigo-700',
    'bg-blue-200',
    'text-blue-700',
    'bg-sky-200',
    'text-sky-700',
    'bg-cyan-200',
    'text-cyan-700',
    'bg-teal-200',
    'text-teal-700',
    'bg-emerald-200',
    'text-emerald-700',
    'bg-green-200',
    'text-green-700',
    'bg-lime-200',
    'text-lime-700',
    'bg-yellow-200',
    'text-yellow-700',
    'bg-amber-200',
    'text-amber-700',
    'bg-orange-200',
    'text-orange-700',
    'bg-red-200',
    'text-red-700',
    'bg-stone-200',
    'text-stone-700',
    'bg-neutral-200',
    'text-neutral-700',
    'bg-zinc-200',
    'text-zinc-700',
    'bg-grey-200',
    'text-grey-700',
    'bg-slate-200',
    'text-slate-700',
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
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
