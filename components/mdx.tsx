import { Blank, Option, Question, Solution } from '@/components/question';
import { AlgoFigure } from '@/components/mdx/algo-figure';
import { Callout } from '@/components/mdx/callout';
import { DocTable } from '@/components/mdx/doc-table';
import { Mermaid } from '@/components/mdx/mermaid';
import * as TabsComponents from '@/components/mdx/tabs';
import * as AccordionComponents from 'fumadocs-ui/components/accordion';
import * as FilesComponents from 'fumadocs-ui/components/files';
import * as StepsComponents from 'fumadocs-ui/components/steps';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

/**
 * Global MDX component registry.
 *
 * Cards come from Fumadocs' default mapping. Callout, Tabs / Tab and the
 * code-fence tabs (CodeBlockTabs*) are the official components with stable
 * styling hooks and tab motion (components/mdx/callout.tsx, tabs.tsx), and
 * Markdown tables replace its `table` with DocTable (wrapping columns, copy
 * and expand). The component groups below are registered globally so
 * documentation can use Tabs, Accordions, Steps, Files, TypeTable and Mermaid
 * without repeating imports in every MDX file. AlgoFigure is a colour solution
 * diagram with light / dark SVG variants (components/mdx/algo-figure.tsx). Question, Option, Blank and Solution are the
 * exercise components: <Question id type> declares the interaction (single /
 * multiple / boolean / blank / essay), <Option correct> and <Blank answer>
 * carry the key, and <Solution> holds the reference answer shown in the dialog.
 */
export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...AccordionComponents,
    ...FilesComponents,
    ...StepsComponents,
    ...TabsComponents,
    AlgoFigure,
    Callout,
    table: DocTable,
    Blank,
    Option,
    Question,
    Solution,
    Mermaid,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
