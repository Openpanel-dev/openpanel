import { FaqItem, Faqs } from '@/components/faq';
import { Figure } from '@/components/figure';
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
    Figure,
  } satisfies MDXComponents;
}


declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
