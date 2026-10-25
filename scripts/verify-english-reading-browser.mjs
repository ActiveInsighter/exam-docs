import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.env.READING_BROWSER_MODULES, 'package.json'));
// CI installs only playwright-core and drives the runner's own Chrome
// (READING_BROWSER_CHANNEL=chrome); a full playwright install also works.
const loadPlaywright = () => {
  try { return require('playwright-core'); } catch { return require('playwright'); }
};
const { chromium } = loadPlaywright();
const base = process.env.DEPLOYMENT_URL.replace(/\/$/, '');
const screenshots = process.env.READING_SCREENSHOTS ?? path.resolve('reading-browser-screenshots');
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.READING_BROWSER_CHANNEL || undefined,
  executablePath: process.env.READING_BROWSER_EXECUTABLE || undefined,
});
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
  await page.waitForFunction(() => document.querySelector('[data-english-reading]')?.hasAttribute('data-ready'));
  assert.equal(await root.locator('[data-exam-question]').count(), 5, 'every question must be rendered');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'horizontal page overflow');
  return {
    context,
    page,
    root,
    article: root.locator('[data-reading-article]'),
    questions: root.locator('[data-reading-question-scroller]'),
    current: root.locator('[data-exam-question][data-reading-current]'),
    strip: root.getByRole('navigation', { name: '题目导航' }).getByRole('button'),
  };
}

const overflowY = locator => locator.evaluate(node => getComputedStyle(node).overflowY);
const visibleQuestions = root => root.locator('[data-exam-question]').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0).map(node => node.id));

async function expectCurrent(reading, number) {
  // The question stepped away from fades out for a moment (data-reading-leaving); wait for it to go.
  await reading.page.waitForFunction(([id, index]) => document.querySelector('[data-reading-current]')?.id === id
    && document.querySelectorAll('[aria-label="题目导航"] button')[index]?.getAttribute('aria-current') === 'step'
    && !document.querySelector('[data-reading-leaving]'),
  [`question-english-reading-00${number}`, number - 1]);
  assert.deepEqual(await visibleQuestions(reading.root), [`question-english-reading-00${number}`], 'exactly one question is shown');
}

async function verifySolution(page, trigger, touch = false) {
  if (touch) await trigger.tap();
  else await trigger.click();
  // The solution sheet is titled with the question number, e.g. "第 1 题".
  const dialog = page.getByRole('dialog', { name: /^第 \d+ 题$/ });
  await dialog.waitFor({ state: 'visible' });
  await dialog.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
  assert.ok((await dialog.innerText()).includes('定位第二段末句。'), 'original explanation is missing');
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
  const reading = await openPage({ viewport: { width: 1440, height: 1080 } });
  const { page, root, article, questions, current, strip } = reading;
  const left = await article.boundingBox(), right = await questions.boundingBox();
  assert.ok(left.x + left.width <= right.x, 'article and questions must be side by side');
  assert.ok(left.width > right.width * 0.9 && left.width < right.width * 1.6, 'split ratio favours the article moderately');
  assert.equal(await overflowY(article), 'auto', 'article pane scrolls on its own');
  assert.equal(await overflowY(questions), 'auto', 'question pane scrolls on its own');
  assert.ok(await root.evaluate(node => getComputedStyle(node).borderTopLeftRadius !== '0px'), 'reading card must be rounded');
  assert.equal(await strip.count(), 5, 'the answer sheet lists every question');
  await expectCurrent(reading, 1);

  // Graded in place; the answer sheet follows; 原文定位 marks the evidence.
  const options = current.locator('[data-exam-choice-option]');
  assert.equal(await options.count(), 4, 'all four options must be clickable');
  await options.nth(1).click();
  await current.getByText('回答正确', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await options.nth(1).getAttribute('data-feedback'), 'correct', 'answer B must be graded correct');
  await page.waitForFunction(() => document.querySelector('[aria-label="题目导航"] button')?.dataset.status === 'correct');
  await root.getByRole('button', { name: '原文定位' }).click();
  const evidence = root.locator('[data-reading-evidence="english-reading-001"]');
  assert.equal(await evidence.getAttribute('data-lit'), '', 'graded question marks its evidence');
  await page.waitForFunction(() => {
    const pane = document.querySelector('[data-reading-article]').getBoundingClientRect();
    const box = document.querySelector('[data-reading-evidence="english-reading-001"]').getBoundingClientRect();
    return box.top >= pane.top && box.bottom <= pane.bottom;
  });
  await verifySolution(page, current.getByRole('button', { name: '查看解答', exact: true }));

  // 下一题 / 上一题 and the answer sheet move between questions.
  await root.getByRole('button', { name: '下一题' }).click();
  await expectCurrent(reading, 2);
  await strip.nth(4).click();
  await expectCurrent(reading, 5);
  await root.getByRole('button', { name: '上一题' }).click();
  await expectCurrent(reading, 4);

  // A question that names a paragraph links to it.
  await strip.nth(2).click();
  await expectCurrent(reading, 3);
  await root.getByRole('button', { name: '第 3 段' }).click();
  await page.waitForFunction(() => {
    const pane = document.querySelector('[data-reading-article]').getBoundingClientRect();
    const box = document.querySelectorAll('[data-reading-passage] > [data-reading-paragraph]')[2].getBoundingClientRect();
    return box.top >= pane.top - 1 && box.top < pane.bottom - 40;
  });

  // Navigators elsewhere (the floating dock) reveal a hidden question.
  await page.evaluate(() => document.getElementById('question-english-reading-002')
    .dispatchEvent(new CustomEvent('exam:reveal-question', { bubbles: true, cancelable: true })));
  await expectCurrent(reading, 2);

  // The highlighter, where the browser supports custom highlights.
  if (await page.evaluate(() => 'highlights' in CSS)) {
    await article.evaluate(node => { node.scrollTop = 0; });
    const box = await root.locator('[data-reading-original]').first().boundingBox();
    await page.mouse.move(box.x + 4, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 10, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('toolbar', { name: '高亮' }).getByRole('button', { name: '高亮' }).click();
    assert.equal(await page.evaluate(() => CSS.highlights.get('exam-reading-mark')?.size), 1, 'selection is highlighted');
    await root.getByRole('button', { name: /清除全部/ }).click();
    assert.equal(await page.evaluate(() => CSS.highlights.has('exam-reading-mark')), false, 'highlights clear');
  }

  // Translation and text size keep working.
  await root.locator('[data-pane="article"]').getByRole('button', { name: '显示中文翻译' }).click();
  assert.ok(await root.locator('[data-reading-translation]').first().isVisible(), 'translations show');
  await root.locator('[data-pane="article"]').getByRole('button', { name: '增大字号' }).click();
  assert.equal(await root.getAttribute('data-size'), '2', 'text size grows');

  // The divider is keyboard operable.
  const divider = root.getByRole('separator', { name: '调整原文与题目的宽度' });
  const start = Number(await divider.getAttribute('aria-valuenow'));
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  assert.ok(Number(await divider.getAttribute('aria-valuenow')) < start, 'divider resizes from the keyboard');
  await page.keyboard.press('Enter');
  await page.screenshot({ path: path.join(screenshots, 'reading-desktop.png') });

  // 整篇提交: a pick waits as a draft until 提交全部 grades the passage together.
  await root.getByRole('radio', { name: '整篇提交' }).click();
  await strip.nth(1).click();
  await expectCurrent(reading, 2);
  const draft = current.locator('[data-exam-choice-option]').nth(2);
  await draft.click();
  assert.equal(await draft.getAttribute('data-feedback'), 'selected', 'a pick is held as a draft');
  await root.getByRole('button', { name: /提交全部/ }).click();
  await root.getByRole('alertdialog').getByRole('button', { name: '仍然提交' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="题目导航"] button')[1]?.dataset.status === 'correct');
  await expectCurrent(reading, 1);
  await root.getByRole('radio', { name: '逐题判分' }).click();

  // 展开阅读卡: the passage and questions move into a study card, and back on close.
  await root.locator('[data-reading-expand]:visible').click();
  const expanded = page.locator('[data-english-reading-modal]');
  await expanded.waitFor();
  assert.equal(await expanded.locator('[data-exam-question]').count(), 5, 'the expanded card holds every question');
  assert.equal(await root.locator('[data-exam-question]').count(), 0, 'questions are never rendered twice');
  assert.ok(await expanded.locator('[data-reading-passage]').isVisible(), 'the passage shows in the expanded card');
  await expanded.locator('[data-slot="sc-pager"]').getByRole('button', { name: '下一题' }).click();
  await page.waitForFunction(() => document.querySelector('[data-english-reading-modal] [data-reading-current]')?.id === 'question-english-reading-002');
  await page.screenshot({ path: path.join(screenshots, 'reading-expanded.png') });
  await page.keyboard.press('Escape');
  await expanded.waitFor({ state: 'detached' });
  await expectCurrent(reading, 2);

  // Printing shows the passage and every question in full.
  await page.emulateMedia({ media: 'print' });
  assert.equal((await visibleQuestions(root)).length, 5, 'print shows every question');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('[data-reading-article], [data-reading-question-scroller]')]
    .every(node => node.getClientRects().length > 0 && node.scrollHeight <= node.clientHeight + 1)), 'print must not clip either pane');
  await page.emulateMedia({ media: 'screen' });
  await reading.context.close();
}

async function verifyMobile(width) {
  const reading = await openPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const { page, root, article, questions, current, strip } = reading;
  const tabs = root.getByRole('tab');
  assert.equal(await tabs.count(), 2, 'narrow layout offers the 原文 / 题目 switch');
  assert.ok(await article.isVisible(), 'narrow layout starts on the article');
  assert.equal(await questions.isVisible(), false, 'only one pane is shown at a time');
  assert.equal(await overflowY(article), 'visible', 'mobile article must use normal page scrolling');
  await tabs.nth(1).tap();
  assert.ok(await questions.isVisible(), 'the switch shows the questions');
  assert.equal(await article.isVisible(), false);
  assert.equal(await strip.count(), 5, 'narrow layout keeps the answer sheet');
  await strip.nth(4).tap();
  await expectCurrent(reading, 5);
  await strip.nth(0).tap();
  await expectCurrent(reading, 1);
  await current.locator('[data-exam-choice-option]').nth(1).tap();
  await current.getByText('回答正确', { exact: true }).waitFor({ state: 'visible' });
  // 原文定位 switches to the passage and offers the way back.
  await root.getByRole('button', { name: '原文定位' }).tap();
  assert.ok(await article.isVisible(), 'locating evidence shows the passage');
  await root.getByRole('button', { name: /回到第 1 题/ }).tap();
  assert.ok(await questions.isVisible(), 'the way back returns to the question');
  const trigger = current.getByRole('button', { name: '查看解答', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await verifySolution(page, trigger, true);
  await root.getByRole('button', { name: '下一题' }).tap();
  await expectCurrent(reading, 2);
  await tabs.first().tap();
  assert.ok(await article.isVisible(), 'switch returns to the article');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'horizontal page overflow');
  await page.screenshot({ path: path.join(screenshots, `reading-mobile-${width}.png`) });
  await reading.context.close();
}

try {
  // Each layout runs in its own browser context, so they are checked concurrently.
  await Promise.all([verifyDesktop(), ...[390, 320, 700].map(verifyMobile)]);
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log('Reading layout verified: split card with independent panes, one question at a time, answer sheet and stepper, evidence and paragraph locators, highlighter, translation and text size, keyboard divider, revealed questions, shared dialogs, 整篇提交, the expanded study card, print, and 390/320/700px tabbed touch layouts.');
} finally {
  await browser.close();
}
