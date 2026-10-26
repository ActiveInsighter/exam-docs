import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Point at a directory containing package.json from which `playwright` resolves.
// No dependency is installed and no persistent browser profile is reused.
const require = process.env.QUESTION_BROWSER_MODULES
  ? createRequire(path.join(path.resolve(process.env.QUESTION_BROWSER_MODULES), 'package.json'))
  : createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = (process.env.DEPLOYMENT_URL ?? 'http://127.0.0.1:3017').replace(/\/$/, '');
const output = path.resolve(process.env.QUESTION_BROWSER_OUTPUT ?? '.deploy-tmp/question-database-browser');
const url = `${base}/docs/english/`;
const questionId = 'english-reading-001';
const errors = [];
const evidence = { deploymentUrl: base, startedAt: new Date().toISOString(), checks: [], errors, passed: false };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

function record(name, details = {}) {
  evidence.checks.push({ name, ...details });
  console.log(`PASS ${name}`);
}

function watch(page) {
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // Resource errors are expected during the intentional offline phase.
    if (message.type() === 'error' && /hydrat|uncaught|invalid hook|react error/i.test(message.text())) errors.push(message.text());
  });
}

async function prepare(context) {
  await context.addInitScript(() => {
    window.__questionDatabaseSnapshot = () => new Promise((resolve, reject) => {
      const opening = indexedDB.open('exam-docs-questions');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        if (!db.objectStoreNames.contains('answers')) { db.close(); resolve({ records: [], attempts: [] }); return; }
        const tx = db.transaction(['answers', 'attempts'], 'readonly');
        const records = tx.objectStore('answers').getAll();
        const attempts = tx.objectStore('attempts').getAll();
        tx.oncomplete = () => { db.close(); resolve({ records: records.result, attempts: attempts.result }); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  });
}

async function pageIn(context) {
  const page = await context.newPage();
  watch(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const question = page.locator(`[data-exam-question][data-question-id="${questionId}"]`);
  await question.waitFor({ timeout: 60_000 });
  await question.locator('[data-exam-choice-option]').nth(1).waitFor();
  return { page, question };
}

async function saved(page, selected, submitted, attempts) {
  await page.waitForFunction(async ({ questionId, selected, submitted, attempts }) => {
    const snapshot = await window.__questionDatabaseSnapshot();
    const record = snapshot.records.find(value => value.namespace === 'guest' && value.questionId === questionId);
    const history = snapshot.attempts.filter(value => value.namespace === 'guest' && value.questionId === questionId);
    return record?.state.submitted === submitted && JSON.stringify(record.state.selected) === JSON.stringify(selected) && history.length === attempts;
  }, { questionId, selected, submitted, attempts });
}

async function choose(question, index = 1) {
  await question.locator('[data-exam-choice-option]').nth(index).click();
  await question.getByText(index === 1 ? '回答正确' : '回答错误', { exact: true }).waitFor();
}

async function redo(question) {
  await question.getByRole('button', { name: '重做', exact: true }).click();
  await question.getByRole('button', { name: '重做', exact: true }).waitFor({ state: 'hidden' });
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  await prepare(desktop);
  const first = await pageIn(desktop);
  await choose(first.question);
  await saved(first.page, ['B'], true, 1);
  await first.page.reload({ waitUntil: 'domcontentloaded' });
  await first.question.getByText('回答正确', { exact: true }).waitFor();
  await saved(first.page, ['B'], true, 1);
  record('desktop submit persists to IndexedDB and restores after reload');

  await redo(first.question);
  await saved(first.page, [], false, 1);
  await first.page.reload({ waitUntil: 'domcontentloaded' });
  await saved(first.page, [], false, 1);
  await first.question.locator('[data-exam-choice-option]').nth(1).waitFor({ state: 'visible' });
  assert.equal(await first.question.getByRole('button', { name: '重做', exact: true }).count(), 0);
  record('redo persists an empty current answer and preserves submission history');

  const second = await pageIn(desktop);
  await choose(first.question);
  await saved(first.page, ['B'], true, 2);
  await second.question.getByText('回答正确', { exact: true }).waitFor();
  await redo(second.question);
  await saved(second.page, [], false, 2);
  await first.question.getByRole('button', { name: '重做', exact: true }).waitFor({ state: 'hidden' });
  record('BroadcastChannel reflects another tab submission and reset');

  await desktop.setOffline(true);
  await choose(first.question, 0);
  await saved(first.page, ['A'], true, 3);
  await desktop.setOffline(false);
  await first.page.reload({ waitUntil: 'domcontentloaded' });
  await first.question.getByText('回答错误', { exact: true }).waitFor();
  await saved(first.page, ['A'], true, 3);
  record('offline submission persists and restores after returning online');
  await first.question.scrollIntoViewIfNeeded();
  await first.page.screenshot({ path: path.join(output, 'desktop-persisted-answer.png') });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  await prepare(mobile);
  const narrow = await pageIn(mobile);
  await choose(narrow.question);
  await saved(narrow.page, ['B'], true, 1);
  assert.equal(await narrow.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'mobile horizontal overflow');
  await narrow.page.screenshot({ path: path.join(output, 'mobile-persisted-answer.png') });
  record('390×844 question page has no horizontal overflow');
  await mobile.close();
  assert.deepEqual(errors, [], 'browser hydration or runtime errors');
  evidence.passed = true;
  console.log(`Question database browser verification passed. Evidence: ${output}`);
} catch (error) {
  evidence.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  evidence.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await browser.close();
}
