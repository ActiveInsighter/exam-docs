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
  // The Spacious layout scrolls inside the page panel on desktop and the
  // document on mobile, so measure whichever ancestor actually scrolls.
  await context.addInitScript(() => {
    window.__readingScroller = node => {
      for (let element = node.parentElement; element; element = element.parentElement) {
        const overflowY = getComputedStyle(element).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight) return element;
      }
      return document.scrollingElement;
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/docs/english/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const root = page.locator('[data-english-reading]');
  await root.waitFor();
  assert.equal(await root.locator('[data-exam-question]').count(), 5, 'every question must render');
  // Narrow layouts hide the inactive pane, so count only what is visible.
  const triggers = root.locator('[data-exam-question]').getByRole('button', { name: '查看解答', exact: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'horizontal page overflow');
  return { context, page, root, triggers, article: root.locator('[data-reading-article]'), questions: root.locator('[data-reading-questions]') };
}

const overflowY = locator => locator.evaluate(node => getComputedStyle(node).overflowY);

async function verifySolution(page, trigger, touch = false) {
  if (touch) await trigger.tap();
  else await trigger.click();
  // The solution sheet is titled with the question number, e.g. "第 1 题".
  const dialog = page.getByRole('dialog', { name: /^第 \d+ 题$/ });
  await dialog.waitFor({ state: 'visible' });
  await dialog.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
  assert.ok((await dialog.innerText()).includes('定位第二段末句。'), 'original explanation is missing');
  // The sheet may still be sliding in when its animation has not started yet,
  // so wait for it to settle; one that really overflows still fails.
  const fitsViewport = await page.waitForFunction(node => {
    const box = node.getBoundingClientRect();
    return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1;
  }, await dialog.elementHandle(), { timeout: 5000 }).then(() => true, () => false);
  assert.ok(fitsViewport, 'solution dialog exceeds viewport');
  if (touch) await dialog.getByRole('button', { name: '关闭' }).tap();
  else await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await trigger.evaluate(node => node === document.activeElement), 'shared dialog lost return focus');
  assert.notEqual(await page.evaluate(() => document.documentElement.style.overflow), 'hidden', 'dialog left page scrolling locked');
}

async function verifyDesktop() {
  const desktop = await openPage({ viewport: { width: 1440, height: 1080 } });
  const { page, root, article, questions, triggers } = desktop;
  assert.equal(await triggers.count(), 5, 'both panes are visible side by side');
  const left = await article.boundingBox(), right = await questions.boundingBox();
  assert.ok(left.x + left.width <= right.x, 'article and questions must be side by side');
  assert.ok(left.width > right.width * 0.9 && left.width < right.width * 1.6, 'split ratio favours the article moderately');
  assert.equal(await overflowY(article), 'auto', 'article pane scrolls on its own');
  assert.equal(await overflowY(questions), 'auto', 'question pane scrolls on its own');
  assert.ok(await root.evaluate(node => getComputedStyle(node).borderTopLeftRadius !== '0px'), 'reading card must be rounded');

  // A wheel over the card first docks it fully in view, then scrolls the pane.
  await root.evaluate(node => { window.__readingScroller(node).scrollTop = 0; });
  const paneBox = await questions.boundingBox();
  await page.mouse.move(paneBox.x + paneBox.width / 2, Math.min(paneBox.y + 120, 1000));
  for (let step = 0; step < 6; step += 1) {
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  assert.ok(await root.evaluate(node => {
    const box = node.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight + 1;
  }), 'card must dock fully in view before its panes scroll');
  assert.ok(await questions.evaluate(node => node.scrollTop > 0), 'remaining wheel distance scrolls the pane');

  // Choice questions are graded in place and reported in the navigator.
  const firstQuestion = root.locator('[data-exam-question]').first();
  const options = firstQuestion.locator('[data-exam-choice-option]');
  assert.equal(await options.count(), 4, 'all four options must be clickable');
  await options.nth(1).click();
  await firstQuestion.getByText('回答正确', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await options.nth(1).getAttribute('data-feedback'), 'correct', 'answer B must be graded correct');
  const nav = root.getByRole('navigation', { name: '题目导航' }).getByRole('button');
  assert.equal(await nav.count(), 5);
  await page.waitForFunction(() => document.querySelector('[aria-label="题目导航"] button')?.dataset.status === 'correct');
  await verifySolution(page, triggers.first());

  // The navigator scrolls the question pane, not the page.
  await nav.nth(4).click();
  await page.waitForFunction(() => {
    const pane = document.querySelector('[data-reading-questions]');
    const last = pane.querySelectorAll('[data-exam-question]')[4];
    const a = pane.getBoundingClientRect(), b = last.getBoundingClientRect();
    return b.top >= a.top - 1 && b.top < a.bottom - 40;
  });
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="题目导航"] button')[4]?.getAttribute('aria-current') === 'true');

  // Native scrolling chains to the page at the end of a pane.
  await questions.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const before = await root.evaluate(node => window.__readingScroller(node).scrollTop);
  const box = await questions.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 240);
  await page.waitForFunction(([previous]) => window.__readingScroller(document.querySelector('[data-english-reading]')).scrollTop > previous + 5, [before]);

  // The divider is keyboard operable.
  const divider = root.getByRole('separator', { name: '调整原文与题目的宽度' });
  const start = Number(await divider.getAttribute('aria-valuenow'));
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok(Number(await divider.getAttribute('aria-valuenow')) < start, 'divider resizes from the keyboard');
  await page.keyboard.press('Enter');
  await page.screenshot({ path: path.join(screenshots, 'reading-desktop.png') });

  // Printing shows both panes in full rather than their scrolled windows.
  await page.emulateMedia({ media: 'print' });
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('[data-reading-article], [data-reading-questions]')]
    .every(node => node.getClientRects().length > 0 && node.scrollHeight <= node.clientHeight + 1)), 'print must not clip either pane');
  await page.emulateMedia({ media: 'screen' });
  await desktop.context.close();
}

async function verifyMobile(width) {
  const mobile = await openPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const tabs = mobile.root.getByRole('tab');
  assert.equal(await tabs.count(), 2, 'narrow layout offers the 原文 / 题目 switch');
  assert.ok(await mobile.article.isVisible(), 'narrow layout starts on the article');
  assert.equal(await mobile.questions.isVisible(), false, 'only one pane is shown at a time');
  assert.equal(await overflowY(mobile.article), 'visible', 'mobile article must use normal page scrolling');
  await mobile.root.getByRole('button', { name: /开始答题/ }).tap();
  assert.ok(await mobile.questions.isVisible(), 'start button switches to the questions');
  assert.equal(await mobile.article.isVisible(), false);
  assert.equal(await mobile.triggers.count(), 5);
  // The navigator sticks below the switcher and jumps to a question.
  const chips = mobile.root.getByRole('navigation', { name: '题目导航' }).getByRole('button');
  assert.equal(await chips.count(), 5, 'narrow layout keeps the question navigator');
  await chips.nth(4).tap();
  await mobile.page.waitForFunction(() => {
    const last = document.querySelectorAll('[data-reading-questions] [data-exam-question]')[4];
    const nav = document.querySelector('[aria-label="题目导航"]').getBoundingClientRect();
    const box = last.getBoundingClientRect();
    return box.top >= nav.bottom - 1 && box.top < innerHeight - 80;
  });
  await mobile.triggers.first().scrollIntoViewIfNeeded();
  await verifySolution(mobile.page, mobile.triggers.first(), true);
  await tabs.first().tap();
  assert.ok(await mobile.article.isVisible(), 'switch returns to the article');
  await mobile.page.screenshot({ path: path.join(screenshots, `reading-mobile-${width}.png`) });
  await mobile.context.close();
}

try {
  // Each layout runs in its own browser context, so they are checked concurrently.
  await Promise.all([verifyDesktop(), ...[390, 320, 700].map(verifyMobile)]);
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log('Reading layout verified: rounded split card, docked wheel scrolling, independent panes with native chaining, navigator, keyboard divider, in-place grading, shared dialogs, and 390/320/700px tabbed touch layouts.');
} finally {
  await browser.close();
}
