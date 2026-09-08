import {
  ExamAnswer,
  ExamExplanation,
  ExamQuestion,
  ExamSolution,
} from '@/components/exam-question';
import { ExamChoices, ExamOption } from '@/components/exam-choices';
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
 * imports in every MDX file. ExamQuestion/ExamSolution and their answer /
 * explanation markers provide the lightweight answer-dialog pattern used by
 * exercise documents. ExamChoices/ExamOption provide responsive option grids.
 */
export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...AccordionComponents,
    ...FilesComponents,
    ...StepsComponents,
    ...TabsComponents,
    ExamAnswer,
    ExamChoices,
    ExamExplanation,
    ExamOption,
    ExamQuestion,
    ExamSolution,
    Mermaid,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
