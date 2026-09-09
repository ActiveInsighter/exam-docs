import { describe, expect, it } from 'vitest';
import { extractCodeFenceLanguages } from '../lib/static-shiki-preload';

describe('static Shiki grammar preload', () => {
  it('extracts and normalizes fenced code languages deterministically', () => {
    const markdown = [
      '```cpp',
      'int main() {}',
      '```',
      '',
      '```js title="demo"',
      'const value = 1;',
      '```',
      '',
      '~~~py',
      'print("ok")',
      '~~~',
      '',
      '```text',
      'plain text',
      '```',
      '',
      '```cpp',
      'int second = 2;',
      '```',
    ].join('\n');

    expect(extractCodeFenceLanguages(markdown)).toEqual([
      'cpp',
      'javascript',
      'python',
    ]);
  });
});
