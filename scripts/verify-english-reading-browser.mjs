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

async function openPage(options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/docs/english/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const root = page.locator('[data-english-reading]');
  await root.waitFor();
  assert.equal(await root.locator('[data-exam-question]').count(), 5, 'every question must render');
  const triggers = root.getByRole('button', { name: '查看解答', exact: true });
  assert.equal(await triggers.count(), 5);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'horizontal page overflow');
  return { context, page, root, triggers, article: root.locator('[data-reading-article]'), questions: root.locator('[data-reading-questions]') };
}

async function verifySolution(page, trigger, touch = false) {
  if (touch) await trigger.tap();
  else await trigger.click();
  const dialog = page.getByRole('dialog', { name: '题目与解析', exact: true });
  await dialog.waitFor({ state: 'visible' });
  await dialog.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
  assert.ok((await dialog.innerText()).includes('定位第二段末句。'), 'original explanation is missing');
  assert.ok(await dialog.evaluate(node => {
    const box = node.getBoundingClientRect();
    return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
  }), 'solution dialog exceeds viewport');
  if (touch) await dialog.getByRole('button', { name: '关闭解答' }).tap();
  else await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await trigger.evaluate(node => node === document.activeElement), 'shared dialog lost return focus');
  assert.notEqual(await page.evaluate(() => document.documentElement.style.overflow), 'hidden', 'dialog left page scrolling locked');
}

try {
  const desktop = await openPage({ viewport: { width: 1440, height: 1080 } });
  const { page, article, questions, triggers } = desktop;
  const left = await article.boundingBox(), right = await questions.boundingBox();
  assert.ok(left.x + left.width <= right.x, 'article and questions must be side by side');
  const trigger = triggers.first();
  await trigger.hover();
  const tooltip = desktop.root.getByRole('tooltip').first();
  await tooltip.waitFor({ state: 'visible' });
  assert.equal((await tooltip.innerText()).trim(), 'B', 'shared hover answer is wrong');
  await verifySolution(page, trigger);
  await article.evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + scrollY - 72));
  assert.ok(await article.evaluate(node => {
    const box = node.getBoundingClientRect();
    return getComputedStyle(node).position === 'sticky' && box.top >= 56 && box.bottom <= innerHeight;
  }), 'article must remain visible while reading later questions');
  assert.equal(await questions.evaluate(node => getComputedStyle(node).overflowY), 'visible', 'questions should scroll with the page');
  await page.screenshot({ path: path.join(screenshots, 'reading-desktop.png') });

  // Native scrolling must chain to the document at either end of a long article.
  await article.evaluate(node => { node.scrollTop = node.scrollHeight; });
  let before = await page.evaluate(() => scrollY);
  const box = await article.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 240);
  await page.waitForFunction(previous => scrollY > previous + 5, before);
  await article.evaluate(node => { node.scrollTop = 0; });
  before = await page.evaluate(() => scrollY);
  const moved = await article.boundingBox();
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.wheel(0, -240);
  await page.waitForFunction(previous => scrollY < previous - 5, before);
  await desktop.root.locator('[data-exam-question]').nth(4).scrollIntoViewIfNeeded();
  assert.ok(await article.evaluate(node => {
    const box = node.getBoundingClientRect();
    return box.bottom > 72 && box.top < innerHeight;
  }), 'article disappeared beside the final question');
  await desktop.context.close();

  for (const width of [390, 320, 844]) {
    const mobile = await openPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    const passage = await mobile.article.boundingBox(), exercises = await mobile.questions.boundingBox();
    assert.ok(exercises.y >= passage.y + passage.height - 1, 'narrow layout must preserve article then questions');
    assert.equal(await mobile.article.evaluate(node => getComputedStyle(node).position), 'static');
    assert.equal(await mobile.article.evaluate(node => getComputedStyle(node).overflowY), 'visible', 'mobile article must use normal page scrolling');
    await mobile.triggers.first().scrollIntoViewIfNeeded();
    await verifySolution(mobile.page, mobile.triggers.first(), true);
    await mobile.page.screenshot({ path: path.join(screenshots, `reading-mobile-${width}.png`) });
    await mobile.context.close();
  }
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log('Reading layout verified: desktop columns/sticky article, native scroll chaining, all five original questions, hover answers, shared dialogs, and 390/320/844px touch layouts.');
} finally {
  await browser.close();
}
