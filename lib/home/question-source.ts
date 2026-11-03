/*
 * Reads one `<Question>` out of an MDX file without compiling it.
 *
 * The home page shows a few real questions. Their stem, options and correct
 * answer come straight from the source file so that an edit to the question
 * also updates the home page. Only the parts the answer sheet needs are read:
 * the text before the first `<Option>` and the options themselves. Solutions
 * stay on the question page.
 */

export interface ExtractedOption {
  text: string;
  correct: boolean;
}

export interface ExtractedQuestion {
  id: string;
  type: string;
  stem: string;
  options: ExtractedOption[];
}

const QUESTION = /<Question\b([^>]*)>([\s\S]*?)<\/Question>/gu;
const OPTION = /<Option\b([^>]*)>([\s\S]*?)<\/Option>/gu;

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`, 'u').exec(attributes)?.[1];
}

function isCorrect(attributes: string): boolean {
  return /\bcorrect(?:\s*=\s*\{\s*true\s*\})?(?=\s|$)/u.test(attributes.trim());
}

export function extractQuestion(mdx: string, id: string): ExtractedQuestion | null {
  for (const match of mdx.matchAll(QUESTION)) {
    const attributes = match[1] ?? '';
    if (attribute(attributes, 'id') !== id) continue;
    const body = match[2] ?? '';
    const solutionAt = body.search(/<Solution\b/u);
    const head = solutionAt >= 0 ? body.slice(0, solutionAt) : body;
    const firstOption = head.search(/<Option\b/u);
    const options = [...head.matchAll(OPTION)].map((option) => ({
      text: (option[2] ?? '').trim(),
      correct: isCorrect(option[1] ?? ''),
    }));
    return {
      id,
      type: attribute(attributes, 'type') ?? 'single',
      stem: (firstOption >= 0 ? head.slice(0, firstOption) : head).trim(),
      options,
    };
  }
  return null;
}

/**
 * Drops the leading source tag (`【2009】`, `**【1993-2-3 分】**`): the answer
 * sheet prints the source on its own line.
 */
export function stripSourceTag(stem: string): string {
  return stem.replace(/^\s*(?:\*\*)?【[^】]*】(?:\*\*)?\s*/u, '');
}

/** Imported stems sometimes carry a space before Chinese punctuation (`f 、g`). */
export function tidyCjkSpacing(text: string): string {
  return text.replace(/[ \t]+(?=[，。、；：？！）」』”])/gu, '');
}
