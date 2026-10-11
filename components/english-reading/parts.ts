import { Children, Fragment, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { ExamQuestion, ExamSolution } from '../exam-question';
import { splitExamSolution } from '../exam-question-parts';
import { ExamArticle } from './article';
import { ExamKeySentence } from './key-sentence';

export interface ReadingQuestion {
  prompt: ReactNode;
  answer: ReactNode | null;
  explanation: ReactNode;
  evidence: readonly string[];
  buttonLabel: string;
  dialogTitle: string;
}
function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(node =>
    isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment ? flatten(node.props.children) : [node])
    .filter(node => typeof node !== 'string' || node.trim());
}
function walk(children: ReactNode, visit: (node: ReactNode) => void) {
  Children.forEach(children, node => {
    visit(node);
    if (isValidElement<{ children?: ReactNode }>(node)) walk(node.props.children, visit);
  });
}

/** Parse MDX once on the server; presentation does not depend on ordinary exam UI. */
export function splitReadingContent(children: ReactNode): { article: ReactNode; questions: ReadingQuestion[] } {
  const nodes = flatten(children);
  const articles = nodes.filter(node => isValidElement(node) && node.type === ExamArticle);
  if (articles.length !== 1) throw new Error('EnglishReading requires exactly one ExamArticle.');
  const article = articles[0];
  const ids = new Set<string>();
  walk(article, node => {
    if (!isValidElement<{ id: string }>(node) || node.type !== ExamKeySentence) return;
    if (!node.props.id?.trim() || ids.has(node.props.id)) throw new Error(`Duplicate or empty key sentence ID: ${node.props.id}`);
    ids.add(node.props.id);
  });
  const questions = nodes.filter(node => node !== article).map(node => {
    if (!isValidElement<ComponentProps<typeof ExamQuestion>>(node) || node.type !== ExamQuestion) throw new Error('EnglishReading expects ExamQuestion after its article.');
    const content = flatten(node.props.children);
    const solutions = content.filter(part => isValidElement<ComponentProps<typeof ExamSolution>>(part) && part.type === ExamSolution);
    if (solutions.length !== 1 || !isValidElement<ComponentProps<typeof ExamSolution>>(solutions[0])) throw new Error('Each reading question requires exactly one ExamSolution.');
    const solution = solutions[0];
    const evidence = solution.props.evidence ?? [];
    for (const id of evidence) if (!ids.has(id)) throw new Error(`Missing key sentence: ${id}`);
    if (new Set(evidence).size !== evidence.length) throw new Error('Duplicate key sentence reference.');
    return {
      prompt: content.filter(part => part !== solution),
      ...splitExamSolution(solution.props.children), evidence,
      buttonLabel: node.props.buttonLabel ?? '查看解答', dialogTitle: node.props.dialogTitle ?? '题目与解析',
    };
  });
  if (!questions.length) throw new Error('EnglishReading requires an ExamQuestion.');
  return { article, questions };
}
