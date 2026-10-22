import type { Element, Root, RootContent } from 'hast';
import { toHtml } from 'hast-util-to-html';
import type { MdxJsxTextElementHast } from 'mdast-util-mdx-jsx';

const KATEX_ROOT_CLASSES = new Set(['katex', 'katex-display']);
const HTML_OPTIONS = { characterReferences: { useNamedReferences: true } };

/**
 * Ships every rendered formula as one pre-rendered HTML string.
 *
 * rehype-katex expands a formula into dozens of nested spans. Left as hast,
 * MDX turns each span into a React element, so a math-heavy page carries tens
 * of thousands of elements: the server renders and serialises all of them into
 * the RSC payload (inline in the HTML, `index.txt` and the page segment), and
 * the browser hydrates all of them. Formulas never change on the client, so this
 * plugin keeps the outer `span.katex` / `span.katex-display` element and moves
 * its content into `dangerouslySetInnerHTML`. The DOM is unchanged; the payload
 * is about 30% smaller, the RSC row count drops roughly sixfold and hydration
 * skips the formula internals.
 *
 * Run it directly after rehype-katex.
 */
export function rehypeKatexHtml() {
  return (tree: Root) => {
    replaceFormulas(tree);
  };
}

/** Walks elements and MDX JSX nodes alike: formulas often sit inside components. */
function replaceFormulas(parent: { children: RootContent[] }) {
  parent.children.forEach((child, index) => {
    const className = child.type === 'element' ? getKatexRootClassName(child) : null;
    if (className) {
      parent.children[index] = toPrerenderedSpan(className, child as Element) as unknown as RootContent;
    } else if ('children' in child) {
      replaceFormulas(child as { children: RootContent[] });
    }
  });
}

function getKatexRootClassName(node: Element): string | null {
  if (node.tagName !== 'span') return null;
  const { className, ...rest } = node.properties;
  if (!Array.isArray(className) || Object.keys(rest).length > 0) return null;
  return KATEX_ROOT_CLASSES.has(String(className[0])) ? className.join(' ') : null;
}

function toPrerenderedSpan(className: string, node: Element): MdxJsxTextElementHast {
  return {
    type: 'mdxJsxTextElement',
    name: 'span',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'className', value: className },
      {
        type: 'mdxJsxAttribute',
        name: 'dangerouslySetInnerHTML',
        value: {
          type: 'mdxJsxAttributeValueExpression',
          value: '',
          data: {
            estree: {
              type: 'Program',
              sourceType: 'module',
              body: [
                {
                  type: 'ExpressionStatement',
                  expression: {
                    type: 'ObjectExpression',
                    properties: [
                      {
                        type: 'Property',
                        kind: 'init',
                        method: false,
                        shorthand: false,
                        computed: false,
                        key: { type: 'Identifier', name: '__html' },
                        value: { type: 'Literal', value: toHtml(node.children, HTML_OPTIONS) },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
    children: [],
  };
}
