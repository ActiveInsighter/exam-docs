import { Blank, Option, Question, Solution } from '@/components/question';
import { EnglishReading, Evidence, ExamArticle, Paragraph, Translation } from '@/components/english-reading';
import { Mermaid } from '@/components/mdx/mermaid';
import * as AccordionComponents from 'fumadocs-ui/components/accordion';
import * as FilesComponents from 'fumadocs-ui/components/files';
import * as StepsComponents from 'fumadocs-ui/components/steps';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

/**
 * Global MDX component registry.
 *
 * Cards and Callout are included by Fumadocs' default mapping. The additional
 * official component groups below are registered globally so documentation can
 * use Tabs, Accordions, Steps, Files, TypeTable and Mermaid without repeating
 * imports in every MDX file. Question, Option, Blank and Solution are the
 * exercise components: <Question id type> declares the interaction (single /
 * multiple / boolean / blank / essay), <Option correct> and <Blank answer>
 * carry the key, and <Solution> holds the reference answer shown in the dialog.
 * <EnglishReading> pairs one <ExamArticle> with questions; its <Paragraph>s
 * may each hold a <Translation> for the card's 中英对照 toggle, and
 * <Evidence for="question id"> marks the sentence a question is answered from.
 */
export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...AccordionComponents,
    ...FilesComponents,
    ...StepsComponents,
    ...TabsComponents,
    Blank,
    Option,
    Question,
    Solution,
    EnglishReading,
    Evidence,
    ExamArticle,
    Paragraph,
    Translation,
    Mermaid,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
