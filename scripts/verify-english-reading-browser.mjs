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
let page, root, questions, expanded;
const trigger = index => questions.nth(index).getByRole('button', { name: '查看解答', exact: true });
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
async function openPage(options) {
  const context = await browser.newContext(options);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/docs/english/`, { waitUntil: 'networkidle' });
  root = page.locator('[data-english-reading]');
  questions = root.locator('[data-exam-question]');
  expanded = page.locator('[data-exam-solution="expanded"]');
  await root.waitFor();
  assert.equal(await questions.count(), 5);
  return context;
}
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'page has horizontal overflow');
}
async function screenshot(name) {
  await waitFor(async () => await page.locator('[data-exam-solution]').evaluateAll(nodes =>
    nodes.every(node => getComputedStyle(node).opacity === '1')), 'solution entrance did not settle');
  await page.screenshot({ path: path.join(screenshots, name) });
}
async function closeDesktop() {
  await page.keyboard.press('Escape');
  await waitFor(async () => await page.locator('[data-exam-solution]').count() === 0, 'solution did not close');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-exam-solution]').count(), 0, 'dismissed solution reopened under the pointer');
}
async function scrollChaining(scroller, label, touchSession) {
  assert.ok(await scroller.evaluate(node => node.scrollHeight > node.clientHeight + 2), `${label} fixture must overflow`);
  const input = async delta => {
    const bounds = await scroller.boundingBox();
    const viewport = page.viewportSize();
    const x = bounds.x + bounds.width / 2;
    const y = Math.max(80, Math.min(viewport.height - 80, bounds.y + bounds.height / 2));
    if (touchSession) await touchSession.send('Input.synthesizeScrollGesture', { x, y, yDistance: -delta, speed: 800, preventFling: true, gestureSourceType: 'touch' });
    else { await page.mouse.move(x, y); await page.mouse.wheel(0, delta); }
  };
  const middle = await scroller.evaluate(node => { node.scrollTop = (node.scrollHeight - node.clientHeight) / 2; return node.scrollTop; });
  const beforeInternal = await page.evaluate(() => scrollY);
  await input(100);
  await waitFor(async () => await scroller.evaluate((node, before) => node.scrollTop > before + 10, middle), `${label} did not consume internal scrolling`, 4000);
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - beforeInternal) < 4, `${label} moved the page before reaching its boundary`);
  // Actual wheel/touch input proves boundary scrolling reaches the page, rather than only checking CSS.
  for (const delta of [-320, 320]) {
    await scroller.evaluate((node, direction) => { node.scrollTop = direction < 0 ? 0 : node.scrollHeight; }, delta);
    const before = await page.evaluate(() => scrollY);
    await input(delta);
    await page.waitForTimeout(250);
    // scrollTop setters round fractional content offsets; continue the gesture after
    // the first event reaches the physical edge. Containment still fails this check.
    await input(delta);
    await waitFor(async () => await page.evaluate(({ before, delta }) => delta < 0 ? scrollY < before - 10 : scrollY > before + 10,
      { before, delta }), `${label} trapped page scrolling at its ${delta < 0 ? 'top' : 'bottom'} edge`, 4000);
  }
}
async function matchingScrollbar(scroller) {
  assert.ok(await scroller.evaluate(node => {
    const style = getComputedStyle(node);
    const colors = style.scrollbarColor.match(/[a-z-]+\([^)]*\)|#[\da-f]+|[a-z]+/gi);
    if (style.scrollbarColor === 'auto') return false;
    const canvas = document.createElement('canvas').getContext('2d');
    const pixel = color => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1); return [...canvas.getImageData(0, 0, 1, 1).data].join(); };
    return pixel(colors.at(-1)) === pixel(style.backgroundColor);
  }), 'scrollbar track differs from its background');
}
async function addLongContent(target) {
  await target.evaluate(node => {
    const fixture = document.createElement('div');
    fixture.dataset.longReadingFixture = '';
    fixture.innerHTML = '<p>Long content for scroll boundary verification.</p>'.repeat(80);
    node.append(fixture);
  });
}
async function prepareQuestion() {
  await questions.first().evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY - 150, behavior: 'instant' }));
  await page.waitForTimeout(150);
}

try {
  const desktop = await openPage({ viewport: { width: 1440, height: 1080 }, colorScheme: 'light' });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1080 });
    await noOverflow();
    const article = root.getByRole('article').locator('..');
    const bounds = await article.boundingBox();
    const list = await root.getByRole('region', { name: '阅读理解题目' }).boundingBox();
    if (width === 1440) assert.ok(list.x >= bounds.x + bounds.width - 2, 'desktop must have two columns');
    else {
      assert.ok(list.y >= bounds.y + bounds.height - 2, 'narrow layout must stack the complete article before questions');
      assert.ok(await article.evaluate(node => node.scrollHeight <= node.clientHeight + 1), 'narrow article is clipped by an internal scroller');
    }
    await screenshot(`reading-layout-${width}.png`);
  }
  const preview = page.locator('[data-exam-solution="preview"]');
  await trigger(0).hover();
  await preview.waitFor();
  assert.equal((await preview.innerText()).trim(), 'B');
  assert.equal(await active().count(), 0, 'hover must not activate evidence');
  await trigger(0).click();
  await expanded.waitFor();
  assert.ok((await expanded.innerText()).includes('separate the effect'));
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.notEqual(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
  await waitFor(async () => await completed().count() === 1, 'desktop evidence did not finish');
  await page.mouse.move(10, 10);
  assert.ok(await expanded.isVisible(), 'clicked details must stay open when the pointer leaves');
  await screenshot('reading-desktop-evidence.png');
  await trigger(1).focus();
  await page.keyboard.press('Enter');
  await waitFor(async () => await completed().count() === 2, 'multi-sentence evidence did not finish');
  assert.equal(await expanded.count(), 1);
  assert.equal(await root.locator('[data-exam-key-sentence="p2s4"] [data-evidence-active="true"]').count(), 0);
  await expanded.getByRole('button', { name: '重播关键句' }).click();
  await waitFor(async () => await root.locator('[data-state="playing"]').count() === 1, 'replay did not begin');
  await trigger(2).focus();
  await page.keyboard.press('Enter');
  await waitFor(async () => await completed().count() === 1, 'interrupted evidence did not switch');
  assert.equal(await root.locator('[data-exam-key-sentence="p1s3"] [data-evidence-active="true"]').count(), 0);
  await closeDesktop();
  await trigger(0).focus();
  await preview.waitFor();
  await page.keyboard.press('Enter');
  await expanded.waitFor();
  await expanded.getByRole('button', { name: '关闭解答' }).click();
  await waitFor(async () => await expanded.count() === 0, 'close button failed');
  await page.locator('.docs-page-title').click();

  const questionBody = questions.first().locator('[data-exam-question-body]');
  await addLongContent(questionBody);
  await prepareQuestion();
  assert.ok(await questions.first().evaluate(node => node.getBoundingClientRect().height <= innerHeight - 112 + 1), 'question exceeds the viewport height');
  await matchingScrollbar(questionBody);
  await scrollChaining(questionBody, 'question body');
  await prepareQuestion();
  await addLongContent(root.getByRole('article'));
  await scrollChaining(root.getByRole('article').locator('..'), 'desktop article');
  await prepareQuestion();
  await trigger(0).click();
  await expanded.waitFor();
  await addLongContent(expanded);
  await matchingScrollbar(expanded);
  await scrollChaining(expanded, 'expanded solution');
  await closeDesktop();
  await root.locator('[data-long-reading-fixture]').evaluateAll(nodes => nodes.forEach(node => node.remove()));
  await desktop.close();

  // Fresh touch context catches first-tap and hover-dependent bugs desktop clicks miss.
  const touch = await openPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: 'light' });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 800 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await noOverflow();
    const button = trigger(0);
    await button.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => scrollY);
    await button.tap();
    await expanded.waitFor();
    await waitFor(async () => await completed().count() === 1, 'touch evidence did not finish');
    assert.ok(await questions.first().locator('[data-exam-solution="expanded"]').isVisible(), 'touch details must be inline inside their question');
    assert.equal(await page.locator('[data-exam-solution="preview"], dialog[open]').count(), 0, 'touch must not require hover or open a modal');
    const after = await page.evaluate(() => scrollY);
    assert.ok(after >= before - 4 && after <= before + viewport.height, 'opening touch details jumped away from the question');
    assert.ok(await expanded.getByText('B', { exact: true }).evaluate(node => {
      const bounds = node.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > innerHeight) return false;
      for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(ancestor).overflowY)) {
          const clip = ancestor.getBoundingClientRect();
          if (bounds.top < clip.top || bounds.bottom > clip.bottom) return false;
        }
      }
      return true;
    }), 'first tap did not reveal an unclipped answer inside the viewport');
    assert.equal(await page.locator('[data-reading-evidence-nav]').count(), 0, 'initial open must not navigate to evidence');
    const controls = await questions.first().getByRole('button').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height));
    assert.ok(controls.every(height => height >= 44), 'touch controls are smaller than 44px');
    await screenshot(`reading-touch-${viewport.width}x${viewport.height}.png`);
    await questions.first().getByRole('button', { name: '收起解答', exact: true }).tap();
    await waitFor(async () => await expanded.count() === 0, 'second tap did not collapse touch details');
    assert.equal(await active().count(), 0, 'collapse left stale highlights');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger(1).tap();
  await waitFor(async () => await completed().count() === 2, 'touch multi-sentence evidence did not finish');
  const detailsId = await expanded.getAttribute('id');
  await expanded.getByRole('button', { name: /查看原文依据/ }).tap();
  const nav = page.locator('[data-reading-evidence-nav]');
  await nav.waitFor();
  await waitFor(async () => await completed().count() === 2, 'evidence navigation did not finish');
  assert.ok(await active().last().evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.top >= 0 && bounds.top < innerHeight && bounds.bottom > 0;
  }), 'evidence navigation did not bring the sentence into view');
  await screenshot('reading-touch-original-evidence.png');
  await nav.getByRole('button', { name: /返回解答/ }).tap();
  await waitFor(async () => await nav.count() === 0, 'return navigation stayed visible');
  await waitFor(async () => await page.evaluate(() => document.activeElement.id) === detailsId, 'return did not focus the original details');
  await waitFor(async () => await expanded.evaluate(node => node.getBoundingClientRect().top >= 0 && node.getBoundingClientRect().top < innerHeight), 'return did not restore visible details');
  assert.equal(await active().count(), 2, 'return unexpectedly cleared evidence');
  await trigger(2).tap();
  await waitFor(async () => await completed().count() === 1, 'touch question switch failed');
  assert.equal(await expanded.count(), 1);
  assert.equal(await root.locator('[data-exam-key-sentence="p1s3"] [data-evidence-active="true"]').count(), 0);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await screenshot('reading-touch-dark.png');
  await questions.nth(2).getByRole('button', { name: '收起解答', exact: true }).tap();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger(4).tap();
  await waitFor(async () => await completed().count() === 2, 'reduced motion lost evidence', 2000);
  assert.ok(await root.locator('[data-motion-cursor]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'none')));
  await page.setViewportSize({ width: 320, height: 800 });
  await waitFor(async () => await active().evaluateAll(nodes => nodes.every(node => {
    const range = document.createRange();
    range.selectNodeContents(node.querySelector('[data-motion-text]'));
    return node.querySelectorAll('[data-motion-line]').length === [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).length;
  })), 'completed evidence was not remeasured after wrapping');
  await noOverflow();
  await screenshot('reading-touch-reduced-motion.png');
  await questions.nth(4).getByRole('button', { name: '收起解答', exact: true }).tap();
  const touchSession = await touch.newCDPSession(page);
  const touchBody = questions.first().locator('[data-exam-question-body]');
  await addLongContent(touchBody);
  await prepareQuestion();
  await matchingScrollbar(touchBody);
  await scrollChaining(touchBody, 'touch question body', touchSession);
  await trigger(0).tap();
  await expanded.waitFor();
  await addLongContent(expanded);
  await expanded.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await matchingScrollbar(expanded);
  await scrollChaining(expanded, 'touch inline solution', touchSession);
  await touchSession.detach();
  await touch.close();
  assert.deepEqual(errors, [], 'browser reported errors');
  console.log('PASS: responsive article flow; desktop hover/click and keyboard; touch first-tap visible inline answer; evidence/return navigation; touch controls; internal scrolling and wheel/touch chaining at both ends; bounded question; matching scrollbar; sequencing and interruption; dark/reduced motion; responsive line measurement.');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(screenshots, 'reading-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
