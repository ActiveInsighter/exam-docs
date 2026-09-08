import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('static deployment workflows', () => {
  it('probes the Next 16 canonical shared RSC payload', async () => {
    const workflowPaths = [
      '.github/workflows/deploy-cloudflare-worker-assets.yml',
      '.github/workflows/deploy-static-docs-preview.yml',
    ];

    for (const workflowPath of workflowPaths) {
      const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

      expect(workflow, workflowPath).toContain("'/docs/__next.docs.txt'");
      expect(workflow, workflowPath).not.toContain("'/docs/intro/index.txt'");
      expect(workflow, workflowPath).not.toContain("'/docs/intro/__next.docs.txt'");
    }
  });
});
