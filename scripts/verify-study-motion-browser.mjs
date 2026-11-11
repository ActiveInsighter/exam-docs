import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = process.env.QUESTION_BROWSER_MODULES
  ? createRequire(path.join(path.resolve(process.env.QUESTION_BROWSER_MODULES), 'package.json'))
  : createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const base = (process.env.DEPLOYMENT_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const output = process.env.QUESTION_SCREENSHOTS ?? '/tmp/study-motion-screenshots';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QUESTION_BROWSER_EXECUTABLE || undefined });
const errors = [];

async function verify(name, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(theme => localStorage.setItem('theme', theme), options.colorScheme);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/docs/question-types/`, { waitUntil: 'networkidle' });
  const single = page.locator('#question-demo-single-001');
  await single.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#question-demo-single-001 [data-option]')?.getAttribute('aria-disabled') !== 'true');
  const favorite = single.getByRole('button', { name: '收藏', exact: true });
  await favorite.focus();
  assert.equal(await favorite.evaluate(node => node === document.activeElement), true, 'activating an animated icon preserves its button focus');
  await favorite.click();
  await single.locator('[data-favorite="on"]').waitFor();
  await single.getByRole('button', { name: '标签', exact: true }).click();
  const tags = page.getByRole('dialog', { name: '为本题添加标签', exact: true });
  const input = tags.getByRole('textbox', { name: '搜索或新建标签', exact: true });
  await input.fill('动效验证');
  await input.press('Enter');
  await single.locator('[data-user-tag]').filter({ hasText: '动效验证' }).waitFor();
  await page.keyboard.press('Escape');
  await tags.waitFor({ state: 'hidden' });

  // Keyboard and pointer share the same ripple and locking policy.
  const pick = single.locator('[data-option="A"]');
  await pick.focus();
  await page.keyboard.press('Space');
  await single.locator('[data-question-footer][data-attempt-result="incorrect"]').waitFor();
  await single.locator('[data-solution-trigger]').click();
  const card = page.locator('[data-solution-card]');
  await card.waitFor();
  if (options.reducedMotion === 'reduce') {
    assert.equal(await card.getAttribute('data-animate-ui-reduce'), '', 'drawer respects reduced motion from its first visible frame');
  }
  // Both elements ride the entering sheet: sample them in one browser frame.
  const headerOffset = await card.evaluate(node => {
    const close = node.querySelector('[data-slot="modal-close"]').getBoundingClientRect();
    const title = node.querySelector('[data-slot="modal-title"]').getBoundingClientRect();
    return Math.abs(close.y - title.y);
  });
  assert.ok(headerOffset < 12, 'close stays on the title row at narrow widths');
  assert.equal(await card.locator('[data-question-mirror] [data-slot="ripple-button-ripple"]').count(), 0, 'a DOM mirror never freezes transient ripples');
  const title = card.locator('[data-slot="modal-title"]');
  await title.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-solution-card] [data-slot="modal-title"]')?.textContent.includes('第 2 题'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('[data-solution-card] [data-slot="modal-title"]')?.textContent.includes('第 2 题'));
  await card.getByRole('button', { name: '收藏与标签', exact: true }).click();
  const library = page.getByRole('dialog', { name: '收藏与标签', exact: true });
  await library.waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await library.evaluate(node => node.contains(document.activeElement)), true, 'nested sheet traps focus');
  await page.keyboard.press('Escape');
  await library.waitFor({ state: 'hidden' });
  assert.equal(await card.isVisible(), true, 'Escape closes only the nested sheet');
  await card.getByRole('button', { name: '收藏与标签', exact: true }).click();
  await library.waitFor();
  await library.locator('[data-slot=modal-close]').click();
  await card.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-solution-trigger')), true, 'closing the stack restores the current question trigger');

  // Grade-control arrows keep their meaning inside a study card.
  const blank = page.locator('#question-demo-blank-001');
  await blank.locator('[data-solution-trigger]').click();
  await card.waitFor();
  const grade = card.locator('[data-blank-grade]').first();
  await grade.getByRole('button', { name: '判对', exact: true }).focus();
  const before = await title.textContent();
  await page.keyboard.press('ArrowRight');
  assert.equal(await title.textContent(), before, 'grading arrows do not page the deck');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('判错')), true);
  await card.getByRole('button', { name: '关闭', exact: true }).click();
  await card.waitFor({ state: 'hidden' });

  await page.goto(`${base}/blog/component-showcase/`, { waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: '多级弹窗', exact: true });
  await trigger.click();
  const first = page.getByRole('dialog', { name: '题目列表', exact: true });
  await first.waitFor();
  const body = first.locator('[data-slot="modal-body"]');
  await body.evaluate(node => { node.scrollTop = 80; });
  const scroll = await body.evaluate(node => node.scrollTop);
  await first.getByRole('button', { name: '打开「收藏与标签」', exact: true }).click();
  const second = page.getByRole('dialog', { name: '收藏与标签', exact: true });
  await second.waitFor();
  await second.getByRole('button', { name: '打开「确认」', exact: true }).click();
  const third = page.getByRole('dialog', { name: '确认', exact: true });
  await third.waitFor();
  await page.screenshot({ path: path.join(output, `${name}-nested-mid.png`) });
  await third.getByRole('button', { name: '返回', exact: true }).click();
  await third.waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await second.waitFor({ state: 'hidden' });
  assert.equal(await body.evaluate(node => node.scrollTop), scroll, 'return preserves the parent scroll position');
  await first.getByRole('button', { name: '打开「收藏与标签」', exact: true }).click();
  await second.waitFor();
  await second.locator('[data-slot=modal-close]').click();
  await first.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true, 'three-level close restores the root trigger');
  // Use frame-spaced gestures: a single synthetic jump never tests native swipe physics.
  await trigger.click();
  await first.waitFor();
  await first.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
  const headerBox = await first.locator('[data-slot="modal-header"]').boundingBox();
  const sheetBox = await first.boundingBox();
  const x = headerBox.x + headerBox.width / 2;
  const y = headerBox.y + 3;
  const distance = sheetBox.height * 0.72;
  const cdp = options.hasTouch ? await context.newCDPSession(page) : null;
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  else { await page.mouse.move(x, y); await page.mouse.down(); }
  for (let i = 1; i <= 14; i++) {
    const next = y + distance * i / 14;
    if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: next }] });
    else await page.mouse.move(x, next);
    await page.waitForTimeout(17);
  }
  await page.screenshot({ path: path.join(output, `${name}-drag-mid.png`) });
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  await first.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true, 'drag dismissal restores focus');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no horizontal page overflow');
  console.log(`PASS ${name}: marks, keyboard, rapid paging, nested focus/return/close, retained scroll, drag dismissal`);
  await context.close();
}

try {
  await verify('desktop-light', { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await verify('phone-dark-reduced', { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
  assert.deepEqual(errors, [], 'no browser runtime errors');
} finally {
  await browser.close();
}
