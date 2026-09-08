import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('static deployment workflows', () => {
  it('matches the RSC verification path to each deployment package layout', async () => {
    const workflowExpectations = [
      {
        path: '.github/workflows/deploy-cloudflare-worker-assets.yml',
        required: ["'/docs/intro/index.txt'", "'/docs/intro/__next.docs.txt'"],
        forbidden: ["'/docs/__next.docs.txt'"],
      },
      {
        path: '.github/workflows/deploy-static-docs-preview.yml',
        required: ["'/docs/__next.docs.txt'"],
        forbidden: ["'/docs/intro/index.txt'", "'/docs/intro/__next.docs.txt'"],
      },
    ];

    for (const expectation of workflowExpectations) {
      const workflow = await readFile(resolve(process.cwd(), expectation.path), 'utf8');

      for (const path of expectation.required) expect(workflow, expectation.path).toContain(path);
      for (const path of expectation.forbidden) expect(workflow, expectation.path).not.toContain(path);
    }
  });
});
