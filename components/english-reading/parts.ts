import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { ExamQuestion, ExamSolution } from '../exam-question';
import { ExamArticle } from './article';
import { ExamKeySentence } from './key-sentence';

function flattenFragments(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(node =>
    isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment ? flattenFragments(node.props.children) : [node]);
}

function walk(children: ReactNode, visit: (node: ReactNode) => void) {
  Children.forEach(children, node => {
    visit(node);
    if (isValidElement<{ children?: ReactNode }>(node)) walk(node.props.children, visit);
  });
}

/** Catch authoring errors before the static page is published. */
export function splitReadingContent(children: ReactNode) {
  const nodes = flattenFragments(children).filter(node => typeof node !== 'string' || node.trim());
  const articles = nodes.filter(node => isValidElement(node) && node.type === ExamArticle);
  if (articles.length !== 1) throw new Error('EnglishReading requires exactly one ExamArticle.');
  const article = articles[0];
  const questions = nodes.filter(node => node !== article);
  if (!questions.some(node => isValidElement(node) && node.type === ExamQuestion)) throw new Error('EnglishReading requires an ExamQuestion.');
  const ids = new Set<string>();
  walk(article, node => {
    if (!isValidElement<{ id: string }>(node) || node.type !== ExamKeySentence) return;
    if (!node.props.id || ids.has(node.props.id)) throw new Error(`Duplicate or empty key sentence ID: ${node.props.id}`);
    ids.add(node.props.id);
  });
  walk(questions, node => {
    if (!isValidElement<{ evidence?: readonly string[] }>(node) || node.type !== ExamSolution) return;
    for (const id of node.props.evidence ?? []) if (!ids.has(id)) throw new Error(`Missing key sentence: ${id}`);
    if (new Set(node.props.evidence).size !== (node.props.evidence?.length ?? 0)) throw new Error('Duplicate key sentence reference.');
  });
  return { article, questions };
}
