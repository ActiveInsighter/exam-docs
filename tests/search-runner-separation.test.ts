import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dedicated static search runner', () => {
  it('keeps search generation off the four Next shard runners', async () => {
    const workflow = await readFile(
      resolve(process.cwd(), '.github/workflows/deploy-cloudflare-worker-assets.yml'),
      'utf8',
    );
    const searchScript = await readFile(
      resolve(process.cwd(), 'scripts/build-search-index.mjs'),
      'utf8',
    );

    expect(workflow).toContain('search:\n    name: Build search assets');
    expect(workflow).toContain("STATIC_DOCS_SKIP_SEARCH_BUILD: '1'");
    expect(workflow).toContain('name: static-search-assets');
    expect(workflow).toContain('needs: [validate, search, build-shard]');
    expect(workflow).toContain('test ! -e .static-docs/search-index.json');
    expect(workflow).toContain('cp -a /tmp/static-search-output/. .static-docs/');
    expect(searchScript).toContain("process.env.STATIC_DOCS_SKIP_SEARCH_BUILD === '1'");
    expect(searchScript).toContain('dedicated search job owns search assets');
  });
});
