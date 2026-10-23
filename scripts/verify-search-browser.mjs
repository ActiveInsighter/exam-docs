import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Same Playwright installation/Chrome selectors as verify-english-reading-browser.mjs.
const require = createRequire(path.join(process.env.READING_BROWSER_MODULES, 'package.json'));
const { chromium } = require('playwright-core');
const base = process.env.DEPLOYMENT_URL.replace(/\/$/, '');
const output = process.env.READING_SCREENSHOTS ?? '.playwright-cli/search';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.READING_BROWSER_CHANNEL || undefined,
  executablePath: process.env.READING_BROWSER_EXECUTABLE || undefined,
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const workers = new Set();
  let created = 0;
  page.on('worker', (worker) => {
    created++;
    workers.add(worker);
    worker.on('close', () => workers.delete(worker));
  });
  async function until(check, label) {
    for (let i = 0; i < 300 && !check(); i++) await page.waitForTimeout(100);
    assert.ok(check(), label);
  }
  await page.goto(`${base}/docs/english/`);
  await page.waitForFunction(() => {
    const option = document.querySelector('[data-exam-choice-option][role="radio"]');
    return option && option.getAttribute('aria-disabled') !== 'true';
  });
  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  const input = page.getByRole('combobox', { name: 'Search', exact: true });
  const result = page.getByRole('option');

  // A transient router failure must be visible and recover without a reload.
  await page.route('**/search/router-*.json', (route) => route.fulfill({ status: 503, body: 'offline' }));
  await input.fill('特征值');
  const retry = page.getByRole('button', { name: '重试搜索' });
  await retry.waitFor();
  await page.unroute('**/search/router-*.json');
  await retry.click();
  await result.first().waitFor({ timeout: 30_000 });
  await until(() => created >= 2 && workers.size === 0, 'completed search releases both tier workers');
  assert.ok(await result.count() > 0);
  await page.screenshot({ path: path.join(output, 'search-mobile.png') });

  // Reopening the same query runs again, rather than restoring a stuck spinner.
  await page.getByRole('button', { name: 'Close Search' }).click();
  await until(() => workers.size === 0, 'close releases workers');
  const previous = created;
  await page.getByRole('button', { name: 'Open Search', exact: true }).click();
  await until(() => created > previous && workers.size === 0, 'reopening reruns and finishes search');

  // Freeze index requests to observe cancellation of work already in flight.
  await page.route('**/search/*.json', (route) => {
    if (route.request().url().includes('/router-')) return route.continue();
    // Terminating the owning Worker cancels this intentionally unresolved request.
  });
  await input.fill('矩阵');
  await until(() => workers.size > 0, 'new query starts a worker');
  await page.getByRole('button', { name: 'Close Search' }).click();
  await until(() => workers.size === 0, 'closing aborts a stalled index load');
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  assert.deepEqual(errors, [], 'no uncaught browser errors');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no horizontal overflow');
  await writeFile(path.join(output, 'search-verification.json'), JSON.stringify({ createdWorkers: created, activeWorkersAfterClose: workers.size, uncaughtErrors: errors }, null, 2));
  console.log(`Search browser checks passed: ${created} workers created, ${workers.size} retained after close.`);
} finally {
  await browser.close();
}
