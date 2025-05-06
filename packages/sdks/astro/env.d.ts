declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro';
  const component: AstroComponentFactory;
  export default component;
}

/// <reference types="astro/client" />
