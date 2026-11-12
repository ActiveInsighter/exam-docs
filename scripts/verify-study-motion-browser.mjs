import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getShortDocSlugPath } from '../lib/doc-paths.mjs';
import { base, focused, frames, launchBrowser, noOverflow, screenshots, settled } from './browser-ui-helpers.mjs';

await mkdir(screenshots, { recursive: true });
const browser = await launchBrowser();
const reports = [];
const errors = [];
const popup = '[data-slot="modal-content"]';

async function capture(page, name) {
  await page.screenshot({ path: path.join(screenshots, `${name}.png`), animations: 'allow' });
}

async function gone(locator) {
  await locator.waitFor({ state: 'detached' });
}

async function swipe(page, from, to) {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  for (let step = 1; step <= 8; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: from.x + (to.x - from.x) * step / 8,
      y: from.y + (to.y - from.y) * step / 8,
      id: 1,
    }] });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function nested(page, name, options) {
  const trigger = page.getByRole('button', { name: '多级弹窗', exact: true });
  await trigger.click();
  const root = page.locator(popup).first();
  await root.waitFor();
  const entering = await frames(root);
  if (options.reducedMotion === 'reduce') {
    assert.ok(entering.every(frame => Math.abs(frame.y) < 0.1 && Math.abs(frame.scale - 1) < 0.001), 'reduced drawer fades without travelling');
  }
  await settled(root);
  await focused(root.locator('[data-slot="modal-title"]').first());
  const body = root.locator('[data-slot="modal-root-page"] [data-slot="modal-body"]');
  const scrollTop = await body.evaluate(node => {
    const input = document.createElement('input');
    input.dataset.retainedInput = '';
    input.value = '保留输入';
    node.append(input);
    node.scrollTop = 100;
    return node.scrollTop;
  });
  const openChild = root.getByRole('button', { name: '打开「收藏与标签」', exact: true });
  await openChild.click();
  const child = page.locator('[data-slot="modal-page"][data-modal-depth="1"]');
  await child.waitFor();
  const pageFrames = await frames(child);
  if (options.reducedMotion === 'reduce') assert.ok(pageFrames.every(frame => Math.abs(frame.x) < 0.1), 'reduced page navigation fades without travel');
  await settled(child);
  await settled(root);
  const sharedSurface = (await frames(root, 1))[0];
  assert.equal(await page.locator(popup).count(), 1, 'navigation uses one popup');
  assert.equal(await page.locator('[data-slot="modal-backdrop"]').count(), 1, 'navigation uses one backdrop');
  assert.equal(await root.locator('[data-slot="modal-root-page"]').getAttribute('inert'), '', 'covered parent is inert');
  assert.ok(Math.abs(sharedSurface.scale - 1) < 0.001, 'the shared surface never scales on page changes');
  await page.keyboard.press('Tab');
  assert.equal(await child.evaluate(node => node.contains(document.activeElement)), true, 'focus stays in the front drawer');

  const openThird = child.getByRole('button', { name: '打开「确认」', exact: true });
  await openThird.click();
  const third = page.locator('[data-slot="modal-page"][data-modal-depth="2"]');
  await third.waitFor();
  await settled(third);
  await capture(page, `${name}-nested-three`);
  await third.locator('[data-slot="modal-back"]').click();
  await third.waitFor({ state: 'hidden' });
  await settled(root);
  await focused(openThird);
  await page.keyboard.press('Escape');
  await child.waitFor({ state: 'hidden' });
  await settled(root);
  await focused(openChild);
  assert.equal(await body.evaluate(node => node.scrollTop), scrollTop, 'returning preserves parent scroll');
  assert.equal(await body.locator('[data-retained-input]').inputValue(), '保留输入', 'returning preserves form state');

  // Outside dismissal closes one layer; the root stays interactive.
  await openChild.click();
  await child.waitFor();
  await settled(child);
  await page.mouse.click(2, 2);
  await child.waitFor({ state: 'hidden' });
  await settled(root);
  await focused(openChild);

  // The header close action closes the shared surface and restores the page trigger.
  await openChild.click();
  await child.waitFor();
  await child.locator('[data-slot="modal-close"]').click();
  await gone(root);
  await focused(trigger);

  // Reopening after closeAll must not leave an orphan or stale return-focus state.
  await trigger.click();
  await root.waitFor();
  await settled(root);
  if (!options.isMobile) {
    const header = await root.locator('[data-slot="modal-header"]').boundingBox();
    const start = { x: header.x + header.width / 2, y: header.y + 8 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 35, { steps: 8 });
    await page.waitForTimeout(180); // Release slowly enough to exercise snap-back, not flick dismissal.
    await page.mouse.up();
    await settled(root);
    assert.equal(await root.count(), 1, 'short drag springs back');
    const box = await root.boundingBox();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + box.height * 0.8, { steps: 10 });
    await page.mouse.up();
  } else {
    const box = await root.boundingBox();
    await swipe(page, { x: box.x + box.width / 2, y: box.y + 8 }, { x: box.x + box.width / 2, y: box.y + box.height * 0.8 });
  }
  await gone(root);
  await focused(trigger);
  return { entering, sharedSurface };
}

async function study(page, name, options) {
  const trigger = page.getByRole('button', { name: '学习卡片', exact: true });
  await trigger.click();
  const sheet = page.locator('[data-study-card]');
  await sheet.waitFor();
  const title = sheet.locator('[data-slot="modal-title"]').first();
  const titleIs = async text => {
    await page.waitForFunction(text => document.querySelector('[data-study-card] [data-slot="modal-title"]')?.textContent === text, text);
    await settled(sheet);
  };
  const prev = sheet.getByRole('button', { name: '上一个概念', exact: true });
  const next = sheet.getByRole('button', { name: '下一个概念', exact: true });
  await titleIs('极限');
  assert.equal(await prev.isDisabled(), true);
  await next.click();
  await next.click();
  await titleIs('定积分');
  assert.equal(await next.isDisabled(), true);
  await focused(prev);
  await page.keyboard.press('ArrowLeft');
  await titleIs('导数');
  await page.keyboard.press('ArrowLeft');
  await titleIs('极限');
  await focused(next);
  await page.keyboard.press('ArrowRight');
  await titleIs('导数');

  // Rapid direction changes retarget to the last requested card.
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft']) await page.keyboard.press(key);
  await titleIs('导数');
  const content = sheet.locator('[data-slot="panel-frame"]').last();
  await next.click();
  const switching = await frames(content);
  await titleIs('定积分');
  if (options.reducedMotion === 'reduce') {
    assert.ok(switching.every(frame => Math.abs(frame.x) < 0.1 && Math.abs(frame.y) < 0.1), 'reduced card changes keep content in place');
  }
  if (options.isMobile) {
    const box = await sheet.locator('[data-slot="study-card-stage"]').boundingBox();
    await swipe(page, { x: box.x + box.width * 0.3, y: box.y + 145 }, { x: box.x + box.width * 0.75, y: box.y + 145 });
    await titleIs('导数');
    // A wide formula/table owns horizontal scrolling instead of changing cards.
    const scroller = sheet.locator('[data-slot="study-card-content"]').first();
    await scroller.evaluate(node => {
      const fixture = document.createElement('div');
      fixture.dataset.swipeScrollFixture = '';
      fixture.style.cssText = 'overflow-x:auto;white-space:nowrap;height:40px;';
      fixture.textContent = 'Scrollable formula '.repeat(50);
      node.prepend(fixture);
    });
    const fixture = sheet.locator('[data-swipe-scroll-fixture]');
    await fixture.scrollIntoViewIfNeeded();
    const scrollBox = await fixture.boundingBox();
    await swipe(page, { x: scrollBox.x + scrollBox.width * 0.8, y: scrollBox.y + 20 }, { x: scrollBox.x + scrollBox.width * 0.2, y: scrollBox.y + 20 });
    assert.ok(await fixture.evaluate(node => node.scrollLeft > 0), 'wide content retains native horizontal scrolling');
    await titleIs('导数');
    await fixture.evaluate(node => node.remove());
  }
  await capture(page, `${name}-study-card`);
  await title.focus();
  await page.keyboard.press('Escape');
  await gone(sheet);
  await focused(trigger);
  return { switching };
}

async function solution(page, name, options) {
  await page.goto(`${base}/docs/question-types`, { waitUntil: 'networkidle' });
  const question = page.locator('#question-demo-single-001');
  await page.waitForFunction(() => document.querySelector('#question-demo-single-001 [data-option]')?.getAttribute('aria-disabled') !== 'true');
  await question.locator('[data-option="A"]').focus();
  await page.keyboard.press('ArrowRight');
  const picked = question.locator('[data-option="B"]');
  await focused(picked);
  await page.keyboard.press('Space');
  await picked.locator('span[style*="width: 20px"]').waitFor({ state: 'attached' });
  const ripple = await picked.evaluate(node => {
    const ripple = Array.from(node.querySelectorAll('span')).find(span => span.style.width === '20px' && span.style.position === 'absolute');
    return ripple ? { x: parseFloat(ripple.style.left) + 10, y: parseFloat(ripple.style.top) + 10, width: node.offsetWidth, height: node.offsetHeight } : null;
  });
  assert.ok(ripple && Math.abs(ripple.x - ripple.width / 2) < 1 && Math.abs(ripple.y - ripple.height / 2) < 1, 'keyboard ripple starts at the button centre');
  const feedback = await frames(question.locator('[data-result-pill]'));
  assert.equal(await picked.getAttribute('aria-checked'), 'true', 'keyboard selection grades the focused option');
  if (options.reducedMotion === 'reduce') assert.ok(feedback.every(frame => Math.abs(frame.x) < 0.1 && Math.abs(frame.scale - 1) < 0.001), 'custom grading feedback respects reduced motion');
  const trigger = question.locator('[data-solution-trigger]');
  await trigger.click();
  assert.equal(await trigger.getAttribute('data-slot'), 'button', 'solution trigger uses press feedback without ripple');
  const sheet = page.locator('[data-solution-card]');
  await sheet.waitFor();
  const entering = await frames(sheet);
  await settled(sheet);
  const titleBox = await sheet.locator('[data-slot="modal-title"]').first().boundingBox();
  const closeBox = await sheet.locator('[data-slot="modal-close"]').boundingBox();
  assert.ok(Math.abs(titleBox.y - closeBox.y) < 6, 'the close button stays on the title row at narrow widths');
  if (options.reducedMotion === 'reduce') assert.ok(entering.every(frame => Math.abs(frame.y) < 0.1), 'lazy solution respects reduced motion on first open');
  await sheet.locator('[data-question-actions]').getByRole('button', { name: '添加注释', exact: true }).click();
  const note = sheet.getByRole('textbox', { name: '我的注释', exact: true });
  await note.fill('保留编辑光标');
  await page.keyboard.press('ArrowRight');
  assert.ok((await sheet.locator('[data-slot="modal-title"]').first().textContent()).includes('第 1 题'), 'arrows inside an editor do not change cards');
  await page.keyboard.press('Escape');
  await note.waitFor({ state: 'detached' });
  await focused(sheet.locator('[data-question-actions]').getByRole('button', { name: '添加注释', exact: true }));
  assert.equal(await sheet.getAttribute('data-open'), '', 'Escape cancels editing before closing the drawer');
  const libraryTrigger = sheet.getByRole('button', { name: '收藏与标签', exact: true });
  await libraryTrigger.click();
  const library = page.locator('[data-slot="modal-page"][data-modal-depth="1"]');
  await library.waitFor();
  await settled(library);
  assert.equal(await page.getByRole('dialog').count(), 1, 'library shares the solution dialog');
  await capture(page, `${name}-solution-library`);
  await library.locator('[data-slot="modal-back"]').click();
  await library.waitFor({ state: 'hidden' });
  await settled(sheet);
  await focused(libraryTrigger);
  await sheet.locator('[data-slot="modal-close"]:visible').click();
  await gone(sheet);
  await focused(trigger);
  return { entering, feedback, ripple };
}

async function longPage(page) {
  const slug = getShortDocSlugPath('math/past-exams/01-高数分类真题0930/02-模块二-导数与微分/03-第三节-导数的应用.mdx');
  const response = await page.goto(`${base}/docs/${slug}`, { waitUntil: 'networkidle' });
  assert.ok(response.ok(), 'the representative long page loads');
  const cards = page.locator('[data-exam-question]');
  await cards.first().locator('[data-slot="icon-button"]').waitFor();
  const count = await cards.count();
  const activeAtStart = await cards.evaluateAll(nodes => nodes.filter(node => node.querySelector('[data-slot="icon-button"]')).length);
  assert.ok(count >= 100 && activeAtStart < count / 2, 'long pages activate a limited number of animated controls at startup');
  const last = cards.last();
  const favorite = last.locator('[data-favorite]');
  assert.equal(await favorite.getAttribute('data-slot'), null, 'distant controls stay static');
  await page.waitForFunction(id => !document.getElementById(id)?.querySelector('[data-favorite]')?.disabled, await last.getAttribute('id'));
  await favorite.evaluate(node => node.focus({ preventScroll: true }));
  await last.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await last.locator('[data-slot="icon-button"]').waitFor();
  await focused(favorite);
  await noOverflow(page);
  return { count, activeAtStart };
}

try {
  for (const [name, options] of [
    ['desktop-light', { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }],
    ['phone-dark', { viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true }],
    ['desktop-reduced', { viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' }],
    ['phone-reduced', { viewport: { width: 320, height: 740 }, colorScheme: 'dark', isMobile: true, hasTouch: true, reducedMotion: 'reduce' }],
  ]) {
    if (process.env.STUDY_BROWSER_CASE && process.env.STUDY_BROWSER_CASE !== name) continue;
    const context = await browser.newContext(options);
    await context.addInitScript(theme => localStorage.setItem('theme', theme), options.colorScheme);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${base}/blog/component-showcase`, { waitUntil: 'networkidle' });
      const navigation = await nested(page, name, options);
      const cards = await study(page, name, options);
      const answers = await solution(page, name, options);
      await noOverflow(page);
      const activation = name === 'desktop-light' ? await longPage(page) : undefined;
      reports.push({ name, navigation, cards, answers, activation });
      console.log(`PASS ${name}: three-page navigation, focus, drag, keyboard, rapid changes, swipe and lazy solution`);
    } catch (error) {
      await capture(page, `${name}-failure`);
      throw error;
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  await writeFile(path.join(screenshots, 'study-motion-frames.json'), JSON.stringify(reports, null, 2));
  console.log(`Screenshots and sampled frames: ${screenshots}`);
} finally {
  await browser.close();
}
