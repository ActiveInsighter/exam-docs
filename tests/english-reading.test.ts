import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Option, Question, Solution } from '@/components/question';
import { ExamArticle, EnglishReading } from '@/components/english-reading';

const article = createElement(ExamArticle, { title: 'A familiar park', children:
  createElement('p', null, 'Notice ', createElement('em', null, 'the details nearby.')) });
function question(prompt: string, id: string) {
  return createElement(Question, { id, type: 'single', children: [
    createElement('p', { key: 'prompt' }, prompt),
    createElement(Option, { key: 'a' }, 'Paying attention.'),
    createElement(Option, { key: 'b', correct: true }, 'Ignoring the surroundings.'),
    createElement(Solution, { key: 'solution' }, 'Observe the familiar surroundings.'),
  ] });
}

describe('English reading composition', () => {
  it('renders every original question with its shared answer and solution controls', () => {
    const html = renderToStaticMarkup(createElement(EnglishReading, null,
      article, question('Why pay attention?', 'q1'), question('What changed?', 'q2')));
    expect(html).toContain('Why pay attention?');
    expect(html).toContain('What changed?');
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(2);
    expect(html).not.toContain('Observe the familiar surroundings.');
    expect(html).toContain('<em>the details nearby.</em>');
    expect(html.indexOf('A familiar park')).toBeLessThan(html.indexOf('Why pay attention?'));
  });

  it('preserves the shared question component’s support for an exercise without a solution', () => {
    const html = renderToStaticMarkup(createElement(EnglishReading, null,
      article, createElement(Question, { id: 'q3', type: 'essay' }, 'An unfinished exercise')));
    expect(html).toContain('An unfinished exercise');
    expect(html).not.toContain('aria-haspopup="dialog"');
  });

  it('requires exactly one article rather than silently dropping authored content', () => {
    expect(() => EnglishReading({ children: question('Question', 'q4') })).toThrow(/one ExamArticle/);
    expect(() => EnglishReading({ children: [article, article] })).toThrow(/one ExamArticle/);
  });
});
