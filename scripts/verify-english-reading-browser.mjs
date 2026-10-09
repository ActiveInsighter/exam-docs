import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Installed in the CI runner's temporary directory; never changes the project lockfile.
const require = createRequire(path.join(process.env.READING_BROWSER_MODULES, 'package.json'));
const { chromium } = require('playwright');
const base = process.env.DEPLOYMENT_URL.replace(/\/$/, '');
const screenshots = process.env.READING_SCREENSHOTS ?? path.resolve('reading-browser-screenshots');
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, colorScheme: 'light' });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const root = page.locator('[data-english-reading]');
const question = id => root.locator(`[data-question-id="${id}"]`);
const active = () => root.locator('[data-evidence-active="true"]');
const completed = () => root.locator('[data-evidence-active="true"][data-state="complete"]');

async function waitFor(check, message, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(message);
}
async function click(id, name) { await question(id).getByRole('button', { name, exact: true }).click(); }
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'page has horizontal overflow');
  assert.equal(await root.evaluate(node => node.scrollWidth > node.clientWidth + 1), false, 'exercise has horizontal overflow');
}

try {
  await page.goto(`${base}/docs/english/`, { waitUntil: 'networkidle' });
  await root.waitFor();
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  assert.equal(await root.locator('[data-question-id]').count(), 5);
  assert.equal(await root.getByText('正确答案 B', { exact: true }).count(), 0);
  assert.equal(await active().count(), 0);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1080 });
    await noOverflow();
    const article = await root.getByRole('article').boundingBox();
    const questions = await root.getByRole('region', { name: '阅读理解题目' }).boundingBox();
    if (width === 1440) assert.ok(questions.x > article.x + article.width - 2 && Math.abs(questions.y - article.y) < 2, 'desktop should have two columns');
    if (width === 320) assert.ok(questions.y >= article.y + article.height - 2, 'mobile should stack article and questions');
    await root.screenshot({ path: path.join(screenshots, `reading-${width}.png`) });
  }

  // Native radios support keyboard selection; answers and explanations are separate actions.
  const firstRadio = question('q1').getByRole('radio').first();
  await firstRadio.focus();
  await page.keyboard.press('ArrowRight');
  assert.ok(await question('q1').getByRole('radio').nth(1).isChecked());
  await click('q1', '查看答案');
  assert.ok(await question('q1').getByText('正确答案 B', { exact: true }).isVisible());
  assert.equal(await active().count(), 0, 'answer-only should not highlight evidence');
  assert.ok(await firstRadio.isDisabled());

  await click('q1', '查看解析');
  await waitFor(async () => await completed().count() === 1, 'first evidence never completed');
  await root.screenshot({ path: path.join(screenshots, 'reading-evidence-light.png') });
  // Use a wrong choice to exercise distractor feedback and switch away from q1 evidence.
  await question('q2').getByRole('radio').first().check();
  await click('q2', '查看解析');
  assert.equal(await question('q1').getByRole('button', { name: '查看解析', exact: true }).getAttribute('aria-expanded'), 'false');
  assert.ok(await question('q2').getByText('为什么不选 A？', { exact: true }).isVisible());
  await waitFor(async () => await completed().count() === 2, 'two evidence sentences did not play sequentially');
  assert.equal(await root.locator('[data-sentence-id="p2s4"] [data-evidence-active="true"]').count(), 0);
  assert.equal(await root.locator('[data-sentence-id="p1s3"] [data-state="complete"]').count(), 1);
  assert.equal(await root.locator('[data-sentence-id="p3s1"] [data-state="complete"]').count(), 1);
  await click('q2', '重播关键句');
  await waitFor(async () => await root.locator('[data-state="playing"]').count() === 1, 'replay never started');
  await page.waitForTimeout(800);
  assert.ok(await root.locator('[data-motion-line]').evaluateAll(nodes => nodes.some(node => node.style.transform !== 'scaleX(0)')), 'selection did not fill measured lines');
  await root.screenshot({ path: path.join(screenshots, 'reading-cursor.png') });
  // Interrupt playback with another question. Late frames must not restore q2.
  await click('q3', '查看解析');
  await waitFor(async () => await completed().count() === 1, 'switching interrupted playback did not complete q3');
  assert.equal(await root.locator('[data-sentence-id="p1s3"] [data-evidence-active="true"]').count(), 0);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await root.screenshot({ path: path.join(screenshots, 'reading-evidence-dark.png') });
  await noOverflow();
  await click('q3', '收起解析');
  assert.equal(await active().count(), 0);
  await root.getByRole('button', { name: '重新作答', exact: true }).click();
  assert.equal(await root.getByRole('radio', { checked: true }).count(), 0);
  assert.equal(await root.getByText('正确答案 B', { exact: true }).count(), 0);
  assert.equal(await active().count(), 0);

  // Reduced motion preserves all semantic evidence without animated cursors.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await click('q5', '查看解析');
  await waitFor(async () => await completed().count() === 2, 'reduced motion lost evidence', 2000);
  assert.ok(await root.locator('[data-motion-cursor]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'none')));
  await page.setViewportSize({ width: 320, height: 800 });
  await waitFor(async () => await active().evaluateAll(nodes => nodes.every(node => {
    const range = document.createRange();
    range.selectNodeContents(node.querySelector('[data-motion-text]'));
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    return node.querySelectorAll('[data-motion-line]').length === rects.length;
  })), 'completed highlights were not remeasured after mobile wrapping');
  await question('q5').getByRole('button', { name: /第 4 段/ }).click();
  await waitFor(async () => await root.locator('[data-sentence-id="p4s2"]').evaluate(node => {
    const rect = node.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight;
  }), 'mobile evidence navigation did not reach the sentence');
  await root.getByRole('button', { name: '返回解析', exact: true }).click();
  await noOverflow();
  assert.deepEqual(errors, [], 'browser reported errors');
  console.log('PASS: five questions; answer isolation; keyboard radios; evidence sequencing; interrupted playback; replay; reset; responsive layouts; dark theme; reduced motion; mobile evidence navigation.');
} finally {
  await browser.close();
}
