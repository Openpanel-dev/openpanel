import { FaqItem, Faqs } from '@/components/faq';
import { WindowImage } from '@/components/window-image';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import * as FilesComponents from 'fumadocs-ui/components/files';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import * as icons from 'lucide-react';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...(icons as unknown as MDXComponents),
    ...defaultMdxComponents,
    ...TabsComponents,
    ...FilesComponents,
    Accordion,
    Accordions,
    ...components,
    Faqs,
    FaqItem,
    WindowImage,
  } satisfies MDXComponents;
}

declare module 'mdx/types.js' {
  // Augment the MDX types to make it understand React.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementClass = React.JSX.ElementClass;
    type ElementType = React.JSX.ElementType;
    type IntrinsicElements = React.JSX.IntrinsicElements;
  }
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
