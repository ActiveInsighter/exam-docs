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
let page, root, article, question, solution;
const button = name => root.getByRole('button', { name, exact: true });
const active = () => root.locator('[data-evidence-active="true"]');
async function waitFor(check, message, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await page.waitForTimeout(80);
  }
  throw new Error(message);
}
async function openPage(options) {
  const context = await browser.newContext(options);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/docs/english/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); await document.fonts.ready; });
  root = page.locator('[data-reading-workspace]');
  article = root.locator('[data-reading-article-pane]');
  question = root.locator('[data-reading-question-scroll]');
  solution = root.locator('[data-reading-solution]');
  await root.waitFor();
  assert.equal(await question.evaluate(node => {
    const focused = document.activeElement;
    return focused?.getAttribute('tabindex') === '-1' && node.contains(focused);
  }), false, 'initial load unexpectedly focused the question prompt');
  return context;
}
async function dimensions() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'horizontal page overflow');
  assert.ok(await root.evaluate(node => node.getBoundingClientRect().height <= innerHeight - 56 + 1), 'workspace exceeds available viewport height');
  assert.equal(await root.locator('[data-exam-question]').count(), 1, 'only the current question should render');
}
async function desktopPanes() {
  if (page.viewportSize().width === 1440) {
    assert.ok(await article.isVisible() && await root.locator('[data-reading-question-pane]').isVisible(), 'desktop navigation hid an article or question pane');
  }
}
async function selectQuestion(index, touch = false) {
  await button(`第 ${index} 题`)[touch ? 'tap' : 'click']();
  await waitFor(async () => await button(`第 ${index} 题`).getAttribute('aria-current') === 'step', 'question navigation did not update');
  assert.equal(await root.locator('[data-exam-question]').count(), 1);
  await desktopPanes();
}
async function reveal(touch = false) {
  const before = await page.evaluate(() => scrollY);
  await button('查看解答')[touch ? 'tap' : 'click']();
  await solution.waitFor();
  await desktopPanes();
  assert.equal(await button('收起解答').getAttribute('aria-expanded'), 'true');
  assert.ok(await solution.evaluate(node => !!node.closest('[data-reading-question-scroll]')), 'solution must stay in the question scroll region');
  assert.equal(await page.locator('dialog[open], [data-exam-solution="expanded"]').count(), 0, 'reading opened a legacy modal or portal');
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) < 4, 'revealing the answer moved the document');
  await waitFor(async () => await solution.locator('[data-reading-answer]').evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const scroll = node.closest('[data-reading-question-scroll]').getBoundingClientRect();
    return bounds.top >= Math.max(0, scroll.top) && bounds.bottom <= Math.min(innerHeight, scroll.bottom);
  }), 'revealed answer is clipped or outside the viewport');
}
async function screenshot(name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(screenshots, name) });
}
async function evidenceAndReturn(touch = false) {
  const locate = button('定位依据 1');
  await locate.scrollIntoViewIfNeeded();
  const before = await question.evaluate(node => node.scrollTop);
  await locate[touch ? 'tap' : 'click']();
  await waitFor(async () => await root.getAttribute('data-reading-view') === 'article', 'evidence did not select article view');
  const current = article.locator('[data-evidence-current="true"]');
  assert.equal(await current.count(), 1);
  await waitFor(async () => await current.evaluate(node => {
    const bounds = node.getBoundingClientRect(), pane = node.closest('[data-reading-article-pane]').getBoundingClientRect();
    return bounds.top >= Math.max(0, pane.top) && bounds.bottom <= Math.min(innerHeight, pane.bottom);
  }), 'located evidence is not fully visible');
  await screenshot(touch ? 'reading-touch-evidence.png' : 'reading-desktop-evidence.png');
  await button('返回题目')[touch ? 'tap' : 'click']();
  await waitFor(async () => await locate.evaluate(node => document.activeElement === node), 'return did not restore focus to evidence control');
  await waitFor(async () => Math.abs(await question.evaluate(node => node.scrollTop) - before) < 3, 'return lost question scroll position');
  assert.equal(await root.getAttribute('data-reading-view'), 'questions');
  assert.ok(await solution.isVisible(), 'return lost the expanded solution');
}
async function scrollingFixture(scroller, label, touchSession) {
  await page.evaluate(() => {
    for (const position of ['before', 'after']) {
      const spacer = document.createElement('div'); spacer.dataset.readingTestSpacer = ''; spacer.style.height = `${innerHeight}px`;
      document.querySelector('[data-reading-workspace]')[position === 'before' ? 'before' : 'after'](spacer);
    }
  });
  await scroller.evaluate(node => { const fixture = document.createElement('div'); fixture.dataset.readingLongFixture = ''; fixture.innerHTML = '<p>Long reading content for native scroll verification.</p>'.repeat(80); node.append(fixture); });
  await root.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY - 75, behavior: 'instant' }));
  await page.waitForTimeout(150);
  assert.ok(await scroller.evaluate(node => node.scrollHeight > node.clientHeight + 2), `${label} fixture does not overflow`);
  assert.ok(await scroller.evaluate(node => {
    const style = getComputedStyle(node), colors = style.scrollbarColor.match(/[a-z-]+\([^)]*\)|#[\da-f]+|[a-z]+/gi);
    if (style.scrollbarColor === 'auto') return false;
    const canvas = document.createElement('canvas').getContext('2d');
    const pixel = color => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1); return [...canvas.getImageData(0, 0, 1, 1).data].join(); };
    return pixel(colors.at(-1)) === pixel(style.backgroundColor);
  }), `${label} scrollbar track differs from background`);
  const input = async delta => {
    const bounds = await scroller.boundingBox(), viewport = page.viewportSize();
    const x = bounds.x + bounds.width / 2, y = (Math.max(80, bounds.y) + Math.min(viewport.height - 24, bounds.y + bounds.height)) / 2;
    if (!touchSession) { await page.mouse.move(x, y); await page.mouse.wheel(0, delta); return; }
    const endY = Math.max(24, Math.min(viewport.height - 24, y - delta));
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++) {
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (endY - y) * step / 10 }] });
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(150);
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const middle = await scroller.evaluate(node => { node.scrollTop = (node.scrollHeight - node.clientHeight) / 2; return node.scrollTop; });
  const beforeInternal = await page.evaluate(() => scrollY);
  await input(100);
  await waitFor(async () => await scroller.evaluate((node, before) => node.scrollTop > before + 10, middle), `${label} did not consume internal scrolling`);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - beforeInternal) < 4, `${label} moved page before reaching its boundary`);
  for (const delta of [-240, 240]) {
    await root.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY - 75, behavior: 'instant' }));
    await scroller.evaluate((node, direction) => { node.scrollTop = direction < 0 ? 0 : node.scrollHeight; }, delta);
    // Let Chrome's touch compositor catch up after the fixture jumps to an edge.
    await page.waitForTimeout(touchSession ? 500 : 150);
    const before = await page.evaluate(() => scrollY);
    await input(delta); await page.waitForTimeout(200); await input(delta);
    try {
      await waitFor(async () => await page.evaluate(({ before, delta }) => delta < 0 ? scrollY < before - 10 : scrollY > before + 10, { before, delta }), `${label} trapped page scrolling at its ${delta < 0 ? 'top' : 'bottom'}`);
    } catch (error) {
      const position = await scroller.evaluate(node => ({ pageY: scrollY, scrollTop: node.scrollTop, max: node.scrollHeight - node.clientHeight }));
      throw new Error(`${error.message}; before=${before}; ${JSON.stringify(position)}`, { cause: error });
    }
  }
  await page.locator('[data-reading-long-fixture], [data-reading-test-spacer]').evaluateAll(nodes => nodes.forEach(node => node.remove()));
  await root.scrollIntoViewIfNeeded();
}

try {
  const desktop = await openPage({ viewport: { width: 1440, height: 1080 }, colorScheme: 'light' });
  await root.scrollIntoViewIfNeeded();
  await dimensions();
  assert.ok(await article.isVisible() && await root.locator('[data-reading-question-pane]').isVisible(), 'desktop must show both panes');
  assert.ok(await button('上一题').isDisabled());
  await button('查看解答').hover();
  await waitFor(async () => await root.locator('[data-reading-preview]').isVisible(), 'hover answer preview did not appear');
  assert.equal((await root.locator('[data-reading-preview]').innerText()).trim(), 'B');
  assert.equal(await active().count(), 0, 'hover activated evidence');
  await reveal();
  assert.equal(await active().count(), 1);
  await screenshot('reading-desktop-answer.png');
  await evidenceAndReturn();
  await selectQuestion(2); await reveal();
  assert.equal(await active().count(), 2);
  for (const index of [3, 4, 1, 5]) await selectQuestion(index);
  assert.equal(await solution.count(), 0, 'switching retained stale details');
  assert.equal(await active().count(), 0, 'switching retained stale evidence');
  assert.ok(await button('下一题').isDisabled());
  await button('上一题').click(); await button('下一题').click();
  assert.equal(await button('第 5 题').getAttribute('aria-current'), 'step');
  await selectQuestion(1);
  await page.keyboard.press('Tab');
  await waitFor(async () => await button('查看解答').evaluate(node => document.activeElement === node), 'Tab did not move focus from the question prompt to the answer control');
  await waitFor(async () => await root.locator('[data-reading-preview]').isVisible(), 'keyboard focus did not preview answer');
  await page.keyboard.press('Enter'); await solution.waitFor();
  await button('收起解答').click();
  await scrollingFixture(question, 'desktop question');
  await scrollingFixture(article, 'desktop article');
  await selectQuestion(2); await reveal();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1080 }); await dimensions();
    assert.ok(await solution.isVisible(), 'resize lost detailed solution');
    assert.equal(await active().count(), 2, 'resize lost article highlights');
  }
  await desktop.close();

  const touch = await openPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: 'light' });
  assert.ok(await article.isVisible() && !await root.locator('[data-reading-question-pane]').isVisible(), 'mobile should initially show article alone');
  assert.equal(await button('文章').getAttribute('aria-pressed'), 'true');
  assert.ok(await button('题目').evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.top >= 56 && bounds.bottom <= innerHeight;
  }), 'initial question tab is outside the visible viewport');
  await button('题目').tap();
  await waitFor(async () => await root.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.top >= 55 && bounds.bottom <= innerHeight + 1;
  }), 'selecting questions did not bring the entire workspace into the viewport');
  assert.ok(await button('查看解答').evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.top >= 56 && bounds.bottom <= innerHeight;
  }), 'answer control is outside the viewport after selecting questions');
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 800 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await root.scrollIntoViewIfNeeded(); await dimensions();
    assert.ok(!await article.isVisible() && await root.locator('[data-reading-question-pane]').isVisible(), 'mobile question view should hide article');
    await reveal(true);
    assert.equal(await root.getAttribute('data-reading-view'), 'questions', 'opening answer switched to article');
    assert.equal(await button('题目').getAttribute('aria-pressed'), 'true');
    assert.ok(await root.getByRole('button').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).every(node => node.getBoundingClientRect().height >= 44)), 'touch target smaller than 44px');
    await screenshot(`reading-touch-${viewport.width}x${viewport.height}.png`);
    await button('收起解答').tap();
    assert.equal(await active().count(), 0, 'collapse left stale evidence');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await selectQuestion(2, true); await reveal(true); await evidenceAndReturn(true);
  const light = await root.evaluate(node => getComputedStyle(node).color);
  await page.evaluate(() => { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); });
  assert.notEqual(await root.evaluate(node => getComputedStyle(node).color), light, 'dark theme did not change rendered colors');
  await screenshot('reading-touch-dark.png');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(await active().evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationDuration === '0s' && getComputedStyle(node).transitionDuration === '0s')), 'reduced motion leaves animated highlights');
  assert.equal(await root.locator('[data-motion-line], [data-motion-cursor]').count(), 0, 'reading still uses manual text overlays');
  await button('文章').tap(); await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await active().count(), 2); await dimensions();
  await screenshot('reading-touch-article-reduced.png');
  const session = await touch.newCDPSession(page);
  await scrollingFixture(article, 'touch article', session);
  await button('题目').tap();
  await scrollingFixture(question, 'touch question and solution', session);
  await session.detach(); await touch.close();
  assert.deepEqual(errors, [], 'browser reported errors');
  console.log('PASS: bounded reading workspace; single-question navigation; desktop hover and keyboard answer; inline details; evidence and focus/scroll restoration; real touch portrait/landscape; responsive state; native wheel/touch scrolling and both-edge page chaining; matching scrollbar; dark/reduced motion; no portal or console errors.');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(screenshots, 'reading-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
