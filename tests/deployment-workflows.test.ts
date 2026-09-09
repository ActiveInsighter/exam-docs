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

  it('merges four deterministic weighted URL shards with a safe static chunk union', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain("STATIC_DOCS_SHARD_COUNT: '4'");
    expect(workflow).toContain('shard: [0, 1, 2, 3]');
    expect(workflow).toContain('Weighted static shard');
    expect(workflow).toContain('Verify overlapping shared chunks are identical');
    expect(workflow).toContain('.static-docs/_next/static');
    expect(workflow).toContain('Two shards emitted different bytes at the same _next/static path.');
    expect(workflow).toContain('Merge static outputs with conflict checks');
    expect(workflow).toContain('node scripts/verify-static-asset-references.mjs .static-docs');
    expect(workflow).toContain('tests/static-asset-references.test.ts');
    expect(workflow).toContain('test "${doc_routes}" = \'531\'');
    expect(workflow).toContain('test "${markdown}" = \'530\'');
    expect(workflow).toContain('tests/static-doc-shards.test.ts');
    expect(workflow).toContain('tests/static-build-id.test.ts');
    expect(workflow).toContain('tests/search-determinism.test.ts');
  });

  it('builds search once outside the static shard workers', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain('name: Build static search');
    expect(workflow).toContain("STATIC_DOCS_SKIP_SEARCH_BUILD: '1'");
    expect(workflow).toContain('name: static-search');
    expect(workflow).toContain('Merge dedicated search assets');
    expect(workflow).toContain('needs: [validate, search, build-shard]');
    expect(workflow).toContain('test "${search_files}" = \'45\'');
    expect(workflow).toContain('test "${search_files}" = \'44\'');
  });

  it('restores reusable weighted shard caches without creating a cache for every workflow-only commit', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain('-weighted-search-shard-${{ matrix.shard }}-v1-${{ hashFiles(');
    expect(workflow).toContain('-weighted-search-shard-${{ matrix.shard }}-v1-');
    expect(workflow).toContain('-weighted-static-shard-${{ matrix.shard }}-v1-');
    expect(workflow).toContain('-static-shard-${{ matrix.shard }}-v4-');
    expect(workflow).toContain('-static-shard-${{ matrix.shard }}-v3-');
    expect(workflow).not.toContain('-weighted-search-shard-${{ matrix.shard }}-v1-${{ github.sha }}');
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
