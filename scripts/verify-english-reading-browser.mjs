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
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/docs/english/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const root = page.locator('[data-english-reading]');
  await root.waitFor();
  assert.equal(await root.locator('[data-exam-question]').count(), 5, 'every question must be rendered');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'horizontal page overflow');
  return { context, page, root };
}

/** The page shows the passage and 开始答题 only; the questions wait out of sight. */
async function verifyPage({ page, root }) {
  assert.ok(await root.locator('[data-reading-article] [data-reading-passage]').isVisible(), 'the passage shows on the page');
  assert.deepEqual(await visibleQuestions(root), [], 'no question shows on the page');
  for (const name of ['上一题', '逐题判分', '原文']) {
    assert.equal(await root.getByRole('button', { name, exact: true }).count(), 0, `the page has no ${name}`);
  }
  const start = root.getByRole('button', { name: '开始答题' });
  assert.ok(await start.isVisible(), '开始答题 is offered');
  // It floats at the bottom right, beside the question dock, not in a bar over the passage.
  const box = await start.boundingBox(), size = page.viewportSize();
  assert.ok(box.x + box.width > size.width * 0.6 && box.y + box.height > size.height - 96, '开始答题 sits at the bottom right');
  const dock = await page.locator('[data-dock-ball]').boundingBox();
  if (dock) assert.ok(box.x + box.width <= dock.x, '开始答题 leaves the dock clear');
  await page.waitForFunction(() => document.querySelector('[data-reading-bar]')?.textContent.includes('5 题'));
  return start;
}

async function openCard(page, start, touch = false) {
  if (touch) await start.tap();
  else await start.click();
  const card = page.locator('[data-english-reading-modal]');
  await card.waitFor();
  await card.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  return {
    card,
    article: card.locator('[data-reading-article]'),
    questions: card.locator('[data-reading-question-scroller]'),
    current: card.locator('[data-exam-question][data-reading-current]'),
    strip: card.getByRole('navigation', { name: '题目导航' }).getByRole('button'),
  };
}

const overflowY = locator => locator.evaluate(node => getComputedStyle(node).overflowY);
const visibleQuestions = root => root.locator('[data-exam-question]').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0).map(node => node.id));

async function expectCurrent(page, card, number) {
  // The question stepped away from fades out for a moment (data-reading-leaving); wait for it to go.
  await page.waitForFunction(([id, index]) => document.querySelector('[data-english-reading-modal] [data-reading-current]')?.id === id
    && document.querySelectorAll('[data-english-reading-modal] [aria-label="题目导航"] button')[index]?.getAttribute('aria-current') === 'step'
    && !document.querySelector('[data-reading-leaving]'),
  [`question-english-reading-00${number}`, number - 1]);
  assert.deepEqual(await visibleQuestions(card), [`question-english-reading-00${number}`], 'exactly one question is shown');
}

/** Inside the card, a question's solution is a page pushed onto it, with 返回 to come back. */
async function verifySolution(page, trigger, touch = false) {
  if (touch) await trigger.tap();
  else await trigger.click();
  const solution = page.locator('[data-english-reading-modal] [data-slot="modal-page"]:not([data-depth="0"])');
  await solution.waitFor({ state: 'visible' });
  await solution.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  assert.ok((await solution.innerText()).includes('定位第二段末句。'), 'original explanation is missing');
  assert.ok((await solution.innerText()).includes('第 1 题'), 'the solution is titled with the question number');
  if (touch) await solution.getByRole('button', { name: '返回' }).tap();
  else await page.keyboard.press('Escape');
  await solution.waitFor({ state: 'detached' });
  assert.ok(await page.locator('[data-english-reading-modal]').isVisible(), 'coming back keeps the card open');
}

async function verifyDesktop() {
  const { context, page, root } = await openPage({ viewport: { width: 1440, height: 1080 } });
  const start = await verifyPage({ page, root });
  await page.screenshot({ path: path.join(screenshots, 'reading-page.png') });
  const { card, article, questions, current, strip } = await openCard(page, start);
  assert.equal(await card.locator('[data-exam-question]').count(), 5, 'the card holds every question');
  assert.equal(await root.locator('[data-exam-question]').count(), 0, 'questions are never rendered twice');
  const left = await article.boundingBox(), right = await questions.boundingBox();
  assert.ok(left.x + left.width <= right.x, 'article and questions must be side by side');
  assert.equal(await overflowY(article), 'auto', 'article pane scrolls on its own');
  assert.equal(await overflowY(questions), 'auto', 'question pane scrolls on its own');
  assert.equal(await strip.count(), 5, 'the answer sheet lists every question');
  await expectCurrent(page, card, 1);

  // The grading switch shares the answer sheet's row.
  const sheetBox = await card.getByRole('navigation', { name: '题目导航' }).boundingBox();
  const modeBox = await card.getByRole('radiogroup', { name: '判分方式' }).boundingBox();
  assert.ok(Math.abs((sheetBox.y + sheetBox.height / 2) - (modeBox.y + modeBox.height / 2)) < 4, 'grading switch sits beside the answer sheet');
  assert.ok(await card.locator('[data-reading-current] [data-question-footer]').evaluate(node =>
    node.getBoundingClientRect().bottom <= node.closest('[data-reading-question-scroller]').getBoundingClientRect().bottom), 'a question fits without scrolling');

  // Graded in place; the answer sheet follows; 原文定位 marks the evidence.
  const options = current.locator('[data-exam-choice-option]');
  assert.equal(await options.count(), 4, 'all four options must be clickable');
  await options.nth(1).click();
  await current.getByText('回答正确', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await options.nth(1).getAttribute('data-feedback'), 'correct', 'answer B must be graded correct');
  await page.waitForFunction(() => document.querySelector('[data-english-reading-modal] [aria-label="题目导航"] button')?.dataset.status === 'correct');
  await card.getByRole('button', { name: '原文定位' }).click();
  const evidence = card.locator('[data-reading-evidence="english-reading-001"]');
  assert.equal(await evidence.getAttribute('data-lit'), '', 'graded question marks its evidence');
  await page.waitForFunction(() => {
    const pane = document.querySelector('[data-english-reading-modal] [data-reading-article]').getBoundingClientRect();
    const box = document.querySelector('[data-english-reading-modal] [data-reading-evidence="english-reading-001"]').getBoundingClientRect();
    return box.top >= pane.top && box.bottom <= pane.bottom;
  });
  await verifySolution(page, current.getByRole('button', { name: '查看解答', exact: true }));

  // 下一题 / 上一题, the answer sheet and ← / → move between questions; the stepper holds still.
  const stepperTop = async () => (await questions.getByRole('button', { name: '下一题' }).boundingBox()).y;
  const firstStepperTop = await stepperTop();
  await questions.getByRole('button', { name: '下一题' }).click();
  await expectCurrent(page, card, 2);
  await strip.nth(4).click();
  await expectCurrent(page, card, 5);
  await questions.getByRole('button', { name: '上一题' }).click();
  await expectCurrent(page, card, 4);
  assert.ok(Math.abs(await stepperTop() - firstStepperTop) < 2, '上一题 / 下一题 stay put from question to question');
  assert.equal(await card.locator('[data-slot="sc-pager"]').count(), 0, 'the header has no second pager');
  await page.keyboard.press('ArrowLeft');
  await expectCurrent(page, card, 3);

  // A question that names a paragraph links to it.
  await card.getByRole('button', { name: '第 3 段' }).click();
  await page.waitForFunction(() => {
    const pane = document.querySelector('[data-english-reading-modal] [data-reading-article]').getBoundingClientRect();
    const box = document.querySelectorAll('[data-english-reading-modal] [data-reading-passage] > [data-reading-paragraph]')[2].getBoundingClientRect();
    return box.top >= pane.top - 1 && box.top < pane.bottom - 40;
  });

  // The highlighter, where the browser supports custom highlights.
  if (await page.evaluate(() => 'highlights' in CSS)) {
    await article.evaluate(node => { node.scrollTop = 0; });
    const box = await card.locator('[data-reading-original]').first().boundingBox();
    await page.mouse.move(box.x + 4, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 10, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('toolbar', { name: '高亮' }).getByRole('button', { name: '高亮' }).click();
    assert.equal(await page.evaluate(() => CSS.highlights.get('exam-reading-mark')?.size), 1, 'selection is highlighted');
    await card.getByRole('button', { name: /清除全部/ }).click();
    assert.equal(await page.evaluate(() => CSS.highlights.has('exam-reading-mark')), false, 'highlights clear');
  }

  // Translation and text size keep working.
  await card.getByRole('button', { name: '显示中文翻译' }).click();
  assert.ok(await card.locator('[data-reading-translation]').first().isVisible(), 'translations show');
  await card.getByRole('button', { name: '增大字号' }).click();
  assert.equal(await card.getAttribute('data-size'), '2', 'text size grows');
  await card.getByRole('button', { name: '减小字号' }).click();
  await page.screenshot({ path: path.join(screenshots, 'reading-card.png') });

  // 整篇提交: a pick waits as a draft until 提交全部 grades the passage together.
  await card.getByRole('radio', { name: '整篇提交' }).click();
  await strip.nth(1).click();
  await expectCurrent(page, card, 2);
  const draft = current.locator('[data-exam-choice-option]').nth(2);
  await draft.click();
  assert.equal(await draft.getAttribute('data-feedback'), 'selected', 'a pick is held as a draft');
  await card.getByRole('button', { name: /提交全部/ }).click();
  await card.getByRole('alertdialog').getByRole('button', { name: '仍然提交' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-english-reading-modal] [aria-label="题目导航"] button')[1]?.dataset.status === 'correct');
  await expectCurrent(page, card, 1);
  await card.getByRole('radio', { name: '逐题判分' }).click();

  // Closing returns the questions to the page, out of sight, with their answers.
  await page.keyboard.press('Escape');
  await card.waitFor({ state: 'detached' });
  assert.equal(await root.locator('[data-exam-question]').count(), 5, 'questions return to the page');
  assert.deepEqual(await visibleQuestions(root), [], 'and stay out of sight');
  await root.getByRole('button', { name: '继续答题' }).waitFor();
  assert.ok((await root.locator('[data-reading-bar]').innerText()).includes('已答 2/5'), 'the bar keeps the progress');

  // Navigators elsewhere (the floating dock) open the card on a question.
  await page.evaluate(() => document.getElementById('question-english-reading-004')
    .dispatchEvent(new CustomEvent('exam:reveal-question', { bubbles: true, cancelable: true })));
  await card.waitFor();
  await expectCurrent(page, card, 4);
  await page.keyboard.press('Escape');
  await card.waitFor({ state: 'detached' });

  // Printing shows the passage and every question in full.
  await page.emulateMedia({ media: 'print' });
  assert.equal((await visibleQuestions(root)).length, 5, 'print shows every question');
  await page.emulateMedia({ media: 'screen' });
  await context.close();
}

async function verifyMobile(width) {
  const { context, page, root } = await openPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const start = await verifyPage({ page, root });
  await page.screenshot({ path: path.join(screenshots, `reading-page-${width}.png`) });
  const { card, article, questions, current, strip } = await openCard(page, start, true);
  const tabs = card.getByRole('tab');
  assert.equal(await tabs.count(), 2, 'phones offer the 原文 / 题目 switch');
  assert.ok(await questions.isVisible(), 'the card opens on the questions');
  assert.equal(await article.isVisible(), false, 'only one pane is shown at a time');
  assert.equal(await strip.count(), 5, 'phones keep the answer sheet');
  await expectCurrent(page, card, 1);
  await strip.nth(4).tap();
  await expectCurrent(page, card, 5);
  await strip.nth(0).tap();
  await expectCurrent(page, card, 1);
  await current.locator('[data-exam-choice-option]').nth(1).tap();
  await current.getByText('回答正确', { exact: true }).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(screenshots, `reading-card-${width}.png`) });
  // 原文定位 switches to the passage and offers the way back.
  await card.getByRole('button', { name: '原文定位' }).tap();
  assert.ok(await article.isVisible(), 'locating evidence shows the passage');
  await card.getByRole('button', { name: /回到第 1 题/ }).tap();
  assert.ok(await questions.isVisible(), 'the way back returns to the question');
  const trigger = current.getByRole('button', { name: '查看解答', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await verifySolution(page, trigger, true);
  await questions.getByRole('button', { name: '下一题' }).tap();
  await expectCurrent(page, card, 2);
  await tabs.first().tap();
  assert.ok(await article.isVisible(), 'switch shows the article');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'horizontal page overflow');
  await context.close();
}

try {
  // Each layout runs in its own browser context, so they are checked concurrently.
  await Promise.all([verifyDesktop(), ...[390, 320, 700].map(verifyMobile)]);
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log('Reading verified: the passage alone on the page with a floating 开始答题; the study card with independent panes, one question at a time, the answer sheet and grading switch on one row, a stepper that holds still, ← / →, evidence and paragraph locators, highlighter, translation and text size, shared dialogs, 整篇提交, questions returned to the page with their answers, revealed questions, print, and 390/320/700px tabbed touch layouts.');
} finally {
  await browser.close();
}
