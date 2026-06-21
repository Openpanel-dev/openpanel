import { FaqItem, Faqs } from '@/components/faq';
import { Figure } from '@/components/figure';
import { WindowImage } from '@/components/window-image';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import * as FilesComponents from 'fumadocs-ui/components/files';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import * as icons from 'lucide-react';
import Link from 'next/link';
import type { AnchorHTMLAttributes } from 'react';
import { localizedHref, type AppLocale } from '@/i18n/routing';
import type { MDXComponents } from 'mdx/types';

function LocalizedAnchor({
  href,
  locale,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { locale?: AppLocale }) {
  if (!href) {
    return <a {...props} />;
  }

  return <Link href={locale ? localizedHref(href, locale) : href} {...props} />;
}

export function getMDXComponents(
  components?: MDXComponents,
  locale?: AppLocale,
) {
  return {
    ...(icons as unknown as MDXComponents),
    ...defaultMdxComponents,
    ...TabsComponents,
    ...FilesComponents,
    a: (props) => <LocalizedAnchor locale={locale} {...props} />,
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
