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

  it('requires deterministic four-way static generation before deployment', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain("STATIC_DOCS_SHARD_COUNT: '4'");
    expect(workflow).toContain('shard: [0, 1, 2, 3]');
    expect(workflow).toContain('Verify shared chunks are identical');
    expect(workflow).toContain('Merge static outputs with conflict checks');
    expect(workflow).toContain('test "${doc_routes}" = \'531\'');
    expect(workflow).toContain('test "${markdown}" = \'530\'');
    expect(workflow).toContain('tests/static-doc-shards.test.ts');
    expect(workflow).toContain('tests/static-build-id.test.ts');
    expect(workflow).toContain('tests/search-determinism.test.ts');
  });

  it('restores reusable shard caches without creating a cache for every workflow-only commit', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain('-static-shard-${{ matrix.shard }}-v4-${{ hashFiles(');
    expect(workflow).toContain('-static-shard-${{ matrix.shard }}-v4-');
    expect(workflow).toContain('-static-shard-${{ matrix.shard }}-v3-');
    expect(workflow).not.toContain('-static-shard-${{ matrix.shard }}-v4-${{ github.sha }}');
  });

  it('pins Wrangler and avoids a redundant production dry-run', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    const pinnedWranglerCommands = workflow.match(/npx --yes wrangler@4\.129\.0/g) ?? [];
    expect(pinnedWranglerCommands).toHaveLength(2);
    expect(workflow).not.toContain('cloudflare/wrangler-action@v3');
    expect(workflow).not.toContain('node22-wrangler-npx');
    expect(workflow).not.toContain('path: ~/.npm/_npx');
    expect(workflow).toContain("github.ref != 'refs/heads/main'");
    expect(workflow).toContain('inputs.deploy != true');
    expect(workflow).toContain('deployment-url=${deployment_url}');
  });

  it('never deploys non-main branches to production', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('Deploy to Cloudflare Workers Static Assets');
    expect(workflow).toContain('Full static documentation route verification');
    expect(workflow).not.toContain('codex/production-static-shards-v2');
  });
});
