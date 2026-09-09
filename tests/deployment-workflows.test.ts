import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('static deployment workflows', () => {
  it('keeps the Cloudflare deployment on guarded RSC dedupe', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain("'/docs/intro/index.txt'");
    expect(workflow).toContain("'/docs/intro/__next.docs.txt'");
    expect(workflow).toContain(
      "grep -F '/docs/*/index.txt /docs/:splat/__next._full.txt 200'",
    );
    expect(workflow).toContain(
      "grep -F '/docs/*/__next.docs.txt /docs/__next.docs.txt 200'",
    );
    expect(workflow).not.toContain('STATIC_DOCS_DISABLE_RSC_DEDUPE');
  });
});
