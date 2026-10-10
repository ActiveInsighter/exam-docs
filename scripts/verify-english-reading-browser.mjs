import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.env.READING_BROWSER_MODULES, 'package.json'));
const { chromium } = require('playwright');
const base = process.env.DEPLOYMENT_URL.replace(/\/$/, '');
const screenshots = process.env.READING_SCREENSHOTS ?? path.resolve('reading-browser-screenshots');
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, colorScheme: 'light' });
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const root = page.locator('[data-english-reading]');
const questions = root.locator('[data-exam-question]');
const trigger = index => questions.nth(index).getByRole('button', { name: '查看解答', exact: true });
const preview = page.locator('[data-exam-solution="preview"]');
const expanded = page.locator('[data-exam-solution="expanded"]');
const completed = () => root.locator('[data-evidence-active="true"][data-state="complete"]');
const active = () => root.locator('[data-evidence-active="true"]');

async function waitFor(check, message, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(message);
}
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'page has horizontal overflow');
}
async function closeSolution() {
  await page.keyboard.press('Escape');
  await waitFor(async () => await expanded.count() === 0 && await preview.count() === 0, 'solution did not close');
}
async function screenshot(name) { await page.screenshot({ path: path.join(screenshots, name) }); }

try {
  await page.goto(`${base}/docs/english/`, { waitUntil: 'networkidle' });
  await root.waitFor();
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  assert.equal(await questions.count(), 5);
  assert.equal(await active().count(), 0);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1080 });
    await noOverflow();
    const article = await root.getByRole('article').locator('..').boundingBox();
    const list = await root.getByRole('region', { name: '阅读理解题目' }).boundingBox();
    if (width === 1440) assert.ok(list.x > article.x + article.width - 2, 'desktop should have two columns');
    if (width === 320) assert.ok(list.y >= article.y + article.height - 2, 'mobile should stack article and questions');
    await root.screenshot({ path: path.join(screenshots, `reading-${width}.png`) });
  }

  // Hover shows just the answer. Clicking upgrades that same anchored surface.
  await trigger(0).hover();
  await preview.waitFor();
  assert.equal((await preview.innerText()).trim(), 'B');
  assert.equal(await active().count(), 0, 'hover must not activate evidence');
  await screenshot('reading-answer-preview.png');
  await trigger(0).click();
  await expanded.waitFor();
  assert.ok((await expanded.innerText()).includes('separate the effect'));
  assert.equal(await page.locator('dialog[open]').count(), 0, 'reading must not open a modal dialog');
  assert.notEqual(await page.evaluate(() => document.documentElement.style.overflow), 'hidden', 'reading must not lock page scrolling');
  await waitFor(async () => await completed().count() === 1, 'first evidence never completed');
  assert.equal(await root.locator('[data-exam-key-sentence="p2s4"] [data-state="complete"]').count(), 1);
  await screenshot('reading-evidence-light.png');
  await page.mouse.move(10, 10);
  assert.ok(await expanded.isVisible(), 'clicked solution should stay open after pointer leaves');

  // Switch to multi-sentence evidence, then interrupt a replay with another question.
  await trigger(1).click();
  await waitFor(async () => await completed().count() === 2, 'evidence did not play in order');
  assert.equal(await expanded.count(), 1);
  assert.equal(await root.locator('[data-exam-key-sentence="p2s4"] [data-evidence-active="true"]').count(), 0);
  await expanded.getByRole('button', { name: '重播关键句' }).click();
  await waitFor(async () => await root.locator('[data-state="playing"]').count() === 1, 'replay never started');
  await page.waitForTimeout(800);
  assert.ok(await root.locator('[data-motion-line]').evaluateAll(nodes => nodes.some(node => node.style.transform !== 'scaleX(0)')));
  await screenshot('reading-cursor.png');
  await trigger(2).click();
  await waitFor(async () => await completed().count() === 1, 'interrupted playback did not switch');
  assert.equal(await root.locator('[data-exam-key-sentence="p1s3"] [data-evidence-active="true"]').count(), 0);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await screenshot('reading-evidence-dark.png');
  await closeSolution();
  assert.equal(await active().count(), 0);

  // Keyboard focus previews the answer; Enter opens details on the first press.
  await trigger(0).focus();
  await preview.waitFor();
  await page.keyboard.press('Enter');
  await expanded.waitFor();
  await expanded.getByRole('button', { name: '关闭解答' }).click();
  await waitFor(async () => await expanded.count() === 0, 'close button did not close');
  await page.locator('.docs-page-title').click();

  // An oversized question gets its own matching scrollbar, while Portal avoids clipping.
  await questions.first().locator('div').first().evaluate(node => {
    const content = document.createElement('div');
    content.dataset.longQuestionFixture = '';
    content.innerHTML = '<p>Long question content for scrolling verification.</p>'.repeat(80);
    node.append(content);
  });
  const longQuestion = await questions.first().evaluate(node => ({ height: node.getBoundingClientRect().height, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, background: getComputedStyle(node).backgroundColor, scrollbar: getComputedStyle(node).scrollbarColor }));
  assert.ok(longQuestion.height <= 1080 - 112 + 1 && longQuestion.scrollHeight > longQuestion.clientHeight);
  assert.ok(longQuestion.scrollbar.includes(longQuestion.background), 'scrollbar track differs from question surface');
  await trigger(0).hover();
  await preview.waitFor();
  assert.equal((await preview.innerText()).trim(), 'B', 'hover preview was clipped by a scrolling question');
  await trigger(0).click();
  await expanded.waitFor();
  const bounds = await expanded.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 1440 && bounds.y + bounds.height <= 1080, 'solution extends beyond the viewport');
  await closeSolution();
  await root.locator('[data-long-question-fixture]').evaluate(node => node.remove());

  // Reduced motion and mobile layout preserve selection and tap-to-open details.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger(4).click();
  await waitFor(async () => await completed().count() === 2, 'reduced motion lost evidence', 2000);
  assert.ok(await root.locator('[data-motion-cursor]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'none')));
  await page.setViewportSize({ width: 320, height: 800 });
  await waitFor(async () => await active().evaluateAll(nodes => nodes.every(node => {
    const range = document.createRange();
    range.selectNodeContents(node.querySelector('[data-motion-text]'));
    return node.querySelectorAll('[data-motion-line]').length === [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).length;
  })), 'completed evidence was not remeasured after wrapping');
  await closeSolution();
  await trigger(0).click();
  await expanded.waitFor();
  await noOverflow();
  const mobile = await expanded.boundingBox();
  assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 320 && mobile.height <= 800 - 96 + 1);
  await screenshot('reading-mobile-solution.png');
  assert.deepEqual(errors, [], 'browser reported errors');
  console.log('PASS: reused exam slots; hover-to-click details; nonmodal positioning; evidence sequencing; replay; interruption; keyboard; bounded question scrolling; matching scrollbar; responsive wrapping; dark theme; reduced motion; mobile tap.');
} catch (error) {
  await page.screenshot({ path: path.join(screenshots, 'reading-failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
