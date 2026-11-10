import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = process.env.QUESTION_BROWSER_MODULES
  ? createRequire(path.join(path.resolve(process.env.QUESTION_BROWSER_MODULES), 'package.json'))
  : createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const base = (process.env.DEPLOYMENT_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const screenshots = process.env.QUESTION_SCREENSHOTS ?? '/tmp/question-component-screenshots';
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.QUESTION_BROWSER_CHANNEL || undefined,
  executablePath: process.env.QUESTION_BROWSER_EXECUTABLE || undefined,
});
const errors = [];

async function settled(locator) {
  await locator.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
}

async function capture(locator, name) {
  await settled(locator);
  await locator.screenshot({ path: path.join(screenshots, `${name}.png`) });
}

async function status(question, expected) {
  await question.locator(`[data-question-footer][data-attempt-result='${expected}']`).waitFor({ state: 'attached' });
}

async function closeSolution(page) {
  const card = page.locator('[data-solution-card]');
  await card.getByRole('button', { name: '关闭', exact: true }).click();
  await card.waitFor({ state: 'hidden' });
}

async function verify(name, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(theme => localStorage.setItem('theme', theme), options.colorScheme);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/docs/question-types/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Wait for IndexedDB restoration and hydration before clicking an SSR button.
  await page.waitForFunction(() => document.querySelector('#question-demo-single-001 [data-option]')?.getAttribute('aria-disabled') !== 'true');
  const question = id => page.locator(`#question-demo-${id}`);
  const single = question('single-001');
  await capture(single, `${name}-single-idle`);
  await single.locator('[data-option="A"]').click();
  await status(single, 'incorrect');
  await capture(single, `${name}-single-incorrect`);
  await single.getByRole('button', { name: '重做', exact: true }).click();
  await single.locator('[data-option="C"]').click();
  await status(single, 'correct');
  await capture(single, `${name}-single-correct`);

  const multiple = question('multiple-001');
  await multiple.locator('[data-option="A"]').click();
  await status(multiple, 'draft');
  await capture(multiple, `${name}-multiple-draft`);
  await multiple.getByRole('button', { name: '提交答案', exact: true }).click();
  await status(multiple, 'partial');
  assert.equal(await multiple.locator('[data-feedback="missed"]').count(), 2);
  await capture(multiple, `${name}-multiple-partial`);

  const boolean = question('boolean-001');
  await boolean.locator('[data-value="true"]').click();
  await status(boolean, 'incorrect');
  assert.equal(await boolean.locator('[data-choice-note]').count(), 1, 'boolean key has one note');
  assert.equal(await boolean.locator('[data-value="false"]').evaluate(node => getComputedStyle(node, '::after').content), 'none', 'no duplicate pseudo-element note');
  await capture(boolean, `${name}-boolean-incorrect`);

  const blanks = question('blank-001');
  const toggle = blanks.getByRole('button', { name: '对答案自评', exact: true });
  await toggle.click();
  const panel = blanks.locator('[data-grade-panel]');
  await panel.waitFor();
  await capture(blanks, `${name}-blank-panel`);
  await toggle.click();
  await panel.waitFor({ state: 'detached' });
  await toggle.click();
  await panel.locator('[data-blank-grade]').first().getByRole('button', { name: '判对', exact: true }).click();
  await status(blanks, 'idle');
  assert.ok((await panel.innerText()).includes('还剩 1 空未判'));
  await capture(blanks, `${name}-blank-self-draft`);
  await panel.locator('[data-blank-grade]').nth(1).getByRole('button', { name: '判错', exact: true }).click();
  await status(blanks, 'partial');
  await panel.waitFor({ state: 'detached' });
  await blanks.getByRole('button', { name: '手动判分', exact: true }).click();
  await panel.waitFor();
  await capture(blanks, `${name}-blank-manual`);
  assert.equal(await blanks.evaluate(node => node.scrollWidth > node.clientWidth + 1), false, 'grading footer stays within the card');

  await blanks.locator('[data-solution-trigger]').click();
  const card = page.locator('[data-solution-card]');
  await card.waitFor();
  assert.equal(await card.locator('[data-answer-tile]').count(), 2);
  assert.equal(await card.locator('[data-answer-tile]').first().evaluate(node => getComputedStyle(node).display), 'flex', 'answer layout stylesheet is loaded');
  await capture(card, `${name}-solution-blank`);
  await card.locator('[data-blank-grade]').nth(1).getByRole('button', { name: '判对', exact: true }).click();
  await status(blanks, 'correct');
  await closeSolution(page);
  assert.equal(await blanks.locator('[data-solution-trigger]').evaluate(node => node === document.activeElement), true, 'focus returns to the question');

  // Reload restores both the grade and its selected switches.
  await page.reload({ waitUntil: 'networkidle' });
  await status(blanks, 'correct');
  await blanks.getByRole('button', { name: '重做', exact: true }).click();
  await blanks.locator('[data-self-grade-toggle]').click();
  await blanks.getByRole('button', { name: '全部判对', exact: true }).click();
  await status(blanks, 'correct');

  await blanks.getByRole('button', { name: '重做', exact: true }).click();
  await blanks.locator('input[data-question-blank]').first().fill('传输层');
  await blanks.locator('input[data-question-blank]').nth(1).click();
  const keypad = page.locator('[data-math-keypad]');
  await keypad.waitFor();
  await keypad.getByRole('button', { name: '2', exact: true }).click();
  await capture(blanks, `${name}-blank-typed`);
  await keypad.getByRole('button', { name: '收起数学键盘', exact: true }).click();
  await blanks.getByRole('button', { name: '提交答案', exact: true }).click();
  await status(blanks, 'partial');
  await capture(blanks, `${name}-blank-typed-partial`);
  await blanks.getByRole('button', { name: '手动判分', exact: true }).click();
  await panel.locator('[data-blank-grade]').nth(1).getByRole('button', { name: '判对', exact: true }).click();
  await status(blanks, 'correct');
  assert.equal(await panel.locator('[data-grade-note]').count(), 1, 'only the override has a manual-grade note');
  await capture(blanks, `${name}-blank-override`);

  const math = question('blank-002');
  await math.locator('[data-self-grade-toggle]').click();
  await capture(math, `${name}-math-key`);
  await math.locator('[data-solution-trigger]').click();
  await card.waitFor();
  await capture(card, `${name}-solution-math`);
  await closeSolution(page);

  const essay = question('essay-001');
  await essay.getByRole('button', { name: '部分正确', exact: true }).click();
  await status(essay, 'partial');
  await capture(essay, `${name}-essay-partial`);
  await single.locator('[data-solution-trigger]').click();
  await card.waitFor();
  await capture(card, `${name}-solution-choice`);
  await card.getByRole('button', { name: '下一题', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-sc-leaving]') && document.querySelector('[data-solution-card] [data-slot="modal-title"]')?.textContent.includes('第 2 题'));
  await capture(card, `${name}-solution-multiple`);
  await closeSolution(page);

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no horizontal page overflow');
  console.log(`PASS ${name}: choice, boolean, blank self/manual grading, solution, focus, reload and layout`);
  await context.close();
}

try {
  await verify('desktop-light', { viewport: { width: 1440, height: 1080 }, colorScheme: 'light' });
  await verify('phone-light', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
  await verify('phone-dark-reduced', { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
