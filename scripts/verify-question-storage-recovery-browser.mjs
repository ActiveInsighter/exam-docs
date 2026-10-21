import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

// Bundle only the affected components; no Next.js or documentation build.
const require = process.env.QUESTION_BROWSER_MODULES
  ? createRequire(path.join(path.resolve(process.env.QUESTION_BROWSER_MODULES), 'package.json'))
  : createRequire(import.meta.url);
const { chromium } = require('playwright');
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx', contents: `
      import { createRoot } from 'react-dom/client';
      import { QuestionDatabase } from './lib/question-store/database';
      import { QuestionProvider, useQuestionState } from './components/question/question-state';
      import { QuestionFooter } from './components/question/question-footer';
      const namespace = 'user:11111111-1111-4111-8111-111111111111';
      const identity = { documentPath: '/docs/storage-recovery', questionId: 'recovery', questionRevision: 'v1' };
      const database = await QuestionDatabase.open();
      window.storage = { database, namespace, ready: true };
      window.snapshot = async () => ({ record: await database.get(namespace, identity), attempts: await database.listAttempts(namespace) });
      function Probe() {
        const state = useQuestionState();
        return <>
          <button disabled={!state.ready || state.submitted} onClick={() => state.select(['B'])}>选择 B</button>
          <output>{JSON.stringify({ selected: state.selected, attempt: state.attempt, submitted: state.submitted, ready: state.ready })}</output>
          <QuestionFooter question={null} answer={null} solution={null} solutionLabel="解析" buttonLabel="查看解答" dialogTitle="题目" showSolution={false} />
        </>;
      }
      createRoot(document.getElementById('root')).render(
        <QuestionProvider questionId="recovery" questionRevision="v1" spec={{ kind: 'choice', multiple: false, key: ['B'] }}><Probe /></QuestionProvider>
      );
    `,
  },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'browser-harness-context',
    setup(plugin) {
      plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'harness' }));
      plugin.onResolve({ filter: /^\.\/database-provider$/ }, () => ({ path: 'database-provider', namespace: 'harness' }));
      plugin.onLoad({ filter: /.*/, namespace: 'harness' }, ({ path: name }) => ({ contents: name === 'navigation'
        ? `export const usePathname = () => '/docs/storage-recovery';`
        : 'export const useQuestionDatabase = () => window.storage;' }));
    },
  }],
});
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].contents : '<div id="root"></div><script type="module" src="/app.js"></script>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      window.connection = this;
      return transaction.apply(this, args);
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const choose = page.getByRole('button', { name: '选择 B', exact: true });
  await choose.waitFor();
  await page.waitForFunction(() => JSON.parse(document.querySelector('output').textContent).ready);
  // Reproduce a stale connection while the question remains mounted.
  await page.evaluate(() => window.connection.close());
  await choose.click();
  await page.waitForFunction(async () => (await window.snapshot()).attempts.length === 1);
  assert.equal(await page.getByRole('alert').count(), 0);
  console.log('PASS disconnected connection reopens and saves the original submission');

  await page.getByRole('button', { name: '重做', exact: true }).click();
  await page.waitForFunction(async () => !(await window.snapshot()).record.state.submitted);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    window.restoreWrites = () => { IDBObjectStore.prototype.add = add; };
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'attempts') throw new DOMException('Storage full', 'QuotaExceededError');
      return add.apply(this, args);
    };
  });
  await choose.click();
  await page.getByRole('alert').filter({ hasText: '存储空间不足' }).waitFor();
  const failed = await page.evaluate(() => window.snapshot());
  assert.equal(failed.record.state.submitted, false);
  assert.equal(failed.attempts.length, 1);
  assert.deepEqual(await page.locator('output').textContent().then(JSON.parse), { selected: ['B'], attempt: 2, submitted: true, ready: true });
  const leaving = page.waitForEvent('dialog');
  const navigation = page.reload({ timeout: 5000 }).catch(() => undefined);
  const dialog = await leaving;
  assert.equal(dialog.type(), 'beforeunload');
  await dialog.dismiss();
  await navigation;
  console.log('PASS refresh requires confirmation while the answer has not been saved');
  await page.evaluate(() => window.restoreWrites());
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await page.waitForFunction(async () => (await window.snapshot()).attempts.length === 2);
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
  console.log('PASS failed submission stays visible and retry preserves its attempt number');

  await page.reload();
  await page.getByText('回答正确', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('output').textContent().then(JSON.parse), { selected: ['B'], attempt: 2, submitted: true, ready: true });
  assert.equal((await page.evaluate(() => window.snapshot())).attempts.length, 2);
  assert.deepEqual(errors, []);
  console.log('PASS reload restores the saved answer without duplicating submission history');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
