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

  it('merges configurable deterministic weighted URL shards with a safe static chunk union', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain("STATIC_DOCS_SHARD_COUNT: ${{ inputs.shards || '8' }}");
    expect(workflow).toContain("'[0,1,2,3]' || '[0,1,2,3,4,5,6,7]'");
    expect(workflow).toContain('Weighted static shard');
    expect(workflow).toContain('routes < 1');
    expect(workflow).toContain('Verify overlapping shared chunks are identical');
    expect(workflow).toContain('.static-docs/_next/static');
    expect(workflow).toContain('Two shards emitted different bytes at the same _next/static path.');
    expect(workflow).toContain('Merge static outputs with conflict checks');
    expect(workflow).toContain('node scripts/verify-static-asset-references.mjs .static-docs');
    expect(workflow).toContain('test "${doc_routes}" = \'724\'');
    expect(workflow).toContain('test "${markdown}" = \'723\'');
    expect(workflow).toContain('Retry failing static documentation HTML routes');
    expect(workflow).toContain('seq 1 18');
    expect(workflow).toContain('name: Run complete regression suite\n        run: npm test');
  });

  it('checks the live site in a browser in its own job, on the runner Chrome', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');
    const deployJob = workflow.slice(workflow.indexOf('\n  deploy:\n'), workflow.indexOf('\n  verify-browser:\n'));
    const browserJob = workflow.slice(workflow.indexOf('\n  verify-browser:\n'));

    // The deploy job finishes as soon as the site is up and verified over HTTP.
    expect(deployJob).toContain('deployment-url: ${{ steps.cloudflare-deploy.outputs.deployment-url }}');
    expect(deployJob).not.toContain('verify-english-reading-browser');
    expect(browserJob).toContain('needs: deploy');
    expect(browserJob).toContain('DEPLOYMENT_URL: ${{ needs.deploy.outputs.deployment-url }}');
    // No apt fonts and no browser download: playwright-core drives the preinstalled Chrome.
    expect(browserJob).toContain('playwright-core@');
    expect(browserJob).toContain('READING_BROWSER_CHANNEL: chrome');
    expect(workflow).not.toContain('--with-deps');
    expect(workflow).not.toContain('playwright install');
  });

  it('builds search once outside the static shard workers', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain('name: Build static search');
    expect(workflow).toContain("STATIC_DOCS_SKIP_SEARCH_BUILD: '1'");
    expect(workflow).toContain('name: static-search');
    expect(workflow).toContain('Merge dedicated search assets');
    expect(workflow).toContain('needs: [validate, search, build-shard]');
    expect(workflow).toContain('npx tsc --noEmit --incremental false --project tsconfig.ci-app.json');
    expect(workflow).toContain('validated_search_assets=');
    expect(workflow).toContain('manifest.pages !== 723');
    expect(workflow).toContain('Search manifest is missing module categories.');
    expect(workflow).not.toContain('test "${search_files}" =');
  });

  it('reuses bounded Next caches across MDX edits and cleans obsolete entries', async () => {
    const workflow = await readFile(resolve(process.cwd(), '.github/workflows/deploy-cloudflare-worker-assets.yml'), 'utf8');
    const start = workflow.indexOf('name: Choose bounded cache generation');
    const end = workflow.indexOf('name: Build weighted static shard', start);
    const cacheConfiguration = workflow.slice(start, end);

    expect(cacheConfiguration).toContain('actions/cache/restore@v5');
    expect(cacheConfiguration).toContain('-next-bounded-');
    expect(cacheConfiguration).toContain('steps.next-cache-week.outputs.week');
    expect(cacheConfiguration).not.toContain('content/docs/**');
    expect(workflow).toContain('actions/cache/save@v5');
    expect(workflow).toContain('bytes <= 268435456');
    const maintenance = await readFile(resolve(process.cwd(), '.github/workflows/prune-actions-caches.yml'), 'utf8');
    expect(maintenance).toContain('actions: write');
    expect(maintenance).toContain('scripts/prune-actions-caches.mjs');
  });

  it('pins Wrangler and dry-runs only manual dispatches with deployment disabled', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    const pinnedWranglerCommands = workflow.match(/npx --yes wrangler@4\.129\.0/g) ?? [];
    expect(pinnedWranglerCommands).toHaveLength(2);
    expect(workflow).not.toContain('cloudflare/wrangler-action@v3');
    expect(workflow).not.toContain('node22-wrangler-npx');
    expect(workflow).not.toContain('path: ~/.npm/_npx');
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.deploy != true");
    expect(workflow).toContain('inputs.deploy != true');
    expect(workflow).toContain('deployment-url=${deployment_url}');
  });

  it('routes main to production and approved content branches to an isolated preview Worker', async () => {
    const workflowPath = '.github/workflows/deploy-cloudflare-worker-assets.yml';
    const workflow = await readFile(resolve(process.cwd(), workflowPath), 'utf8');

    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('codex/lilin-880-rebuild-*');
    expect(workflow).toContain('codex/math-core-questions-1005');
    expect(workflow).toContain('wrangler_args+=(--name exam-docs-preview)');
    expect(workflow).toContain('Deploy to Cloudflare Workers Static Assets');
    expect(workflow).toContain('Full static documentation route verification');
    expect(workflow).not.toContain('codex/production-static-shards-v2');
  });
});
