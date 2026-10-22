import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Option, Question, Solution } from '@/components/question';
import { ExamArticle, EnglishReading, Paragraph, Translation } from '@/components/english-reading';

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
    expect(html.match(/data-solution-trigger=""/g)).toHaveLength(2);
    expect(html).not.toContain('Observe the familiar surroundings.');
    expect(html).toContain('<em>the details nearby.</em>');
    expect(html.indexOf('A familiar park')).toBeLessThan(html.indexOf('Why pay attention?'));
  });

  it('wraps article and questions in one card with a split view, switcher and navigator', () => {
    const html = renderToStaticMarkup(createElement(EnglishReading, null,
      article, question('Why pay attention?', 'q1')));
    expect(html).toContain('data-english-reading=""');
    expect(html).toContain('data-reading-article=""');
    expect(html).toContain('data-reading-questions=""');
    // Narrow layouts start on the article; the switcher controls both panes.
    expect(html).toContain('data-view="article"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    // Wide layouts get a keyboard-operable divider with a bounded value.
    expect(html).toMatch(/role="separator"[^>]*aria-orientation="vertical"/);
    expect(html).toContain('aria-valuenow="55"');
    expect(html.indexOf('data-reading-article')).toBeLessThan(html.indexOf('data-reading-questions'));
  });

  it('preserves the shared question component’s support for an exercise without a solution', () => {
    const html = renderToStaticMarkup(createElement(EnglishReading, null,
      article, createElement(Question, { id: 'q3', type: 'essay' }, 'An unfinished exercise')));
    expect(html).toContain('An unfinished exercise');
    expect(html).not.toContain('data-solution-trigger');
  });

  it('pairs each paragraph with its translation behind a 翻译 toggle beside 原文', () => {
    const translated = createElement(ExamArticle, { title: 'A familiar park', titleTranslation: '熟悉的公园', children: [
      createElement(Paragraph, { key: 1, children: [
        createElement('p', { key: 'en' }, 'Notice the details nearby.'),
        createElement(Translation, { key: 'zh', children: '留意身边的细节。' }),
      ] }),
      createElement(Paragraph, { key: 2, children: createElement('p', null, 'An untranslated paragraph.') }),
    ] });
    const html = renderToStaticMarkup(createElement(EnglishReading, null,
      translated, question('Why pay attention?', 'q1')));
    // Both toggles (switcher icon and labelled pill) start off.
    expect(html.match(/aria-pressed="false"[^>]*title="逐段显示中英对照翻译"/g)).toHaveLength(2);
    expect(html).not.toContain('data-translation=""');
    // Translations are rendered once, paired inside their own paragraph.
    expect(html.match(/data-reading-paragraph=""/g)).toHaveLength(2);
    expect(html.match(/data-reading-translation=""/g)).toHaveLength(2);
    expect(html).toMatch(/Notice the details nearby\.<\/p><\/div><div[^>]*lang="zh-CN"[^>]*>留意身边的细节。/);
    expect(html).toContain('熟悉的公园');
    expect(html.indexOf('>翻译<')).toBeLessThan(html.indexOf('data-reading-article'));
  });

  it('offers no 翻译 toggle for an article without translations', () => {
    const html = renderToStaticMarkup(createElement(EnglishReading, null,
      article, question('Why pay attention?', 'q1')));
    expect(html).not.toContain('对照翻译');
  });

  it('allows a single translation per paragraph', () => {
    expect(() => renderToStaticMarkup(createElement(Paragraph, { children: [
      createElement(Translation, { key: 1, children: '一' }),
      createElement(Translation, { key: 2, children: '二' }),
    ] })))
      .toThrow(/at most one Translation/);
  });

  it('requires exactly one article rather than silently dropping authored content', () => {
    expect(() => EnglishReading({ children: question('Question', 'q4') })).toThrow(/one ExamArticle/);
    expect(() => EnglishReading({ children: [article, article] })).toThrow(/one ExamArticle/);
  });
});
