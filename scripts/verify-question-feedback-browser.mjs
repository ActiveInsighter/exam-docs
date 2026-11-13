import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { base, launchBrowser, screenshots, settled } from './browser-ui-helpers.mjs';

await mkdir(screenshots, { recursive: true });
const browser = await launchBrowser();
const reports = [];
const errors = [];
const configurations = [
  ['desktop-light', { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' }],
  ['phone-dark', { viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true }],
  ['phone-reduced', { viewport: { width: 320, height: 740 }, colorScheme: 'dark', isMobile: true, hasTouch: true, reducedMotion: 'reduce' }],
];

try {
  for (const [name, options] of configurations) {
    const context = await browser.newContext(options);
    await context.addInitScript(theme => localStorage.setItem('theme', theme), options.colorScheme);
    const page = await context.newPage();
    if (process.env.QUESTION_FEEDBACK_CPU) {
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.QUESTION_FEEDBACK_CPU) });
    }
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/docs/question-types/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#question-demo-single-001 [data-option]')?.getAttribute('aria-disabled') !== 'true');
    const question = page.locator('#question-demo-single-001');
    const correct = question.locator('[data-option="C"]');
    const idle = await correct.evaluate(node => getComputedStyle(node).backgroundColor);

    // Begin inside the click event so automation latency cannot skip the
    // initial frame. Check both the corner tick and the result pill's icon.
    await correct.evaluate(node => {
      window.__feedbackFrames = new Promise(resolve => node.addEventListener('click', () => {
        const question = node.closest('[data-exam-question]');
        const frames = [];
        const start = performance.now();
        const sample = () => {
          frames.push(Array.from(question.querySelectorAll('[data-choice-verdict] path, [data-result-pill] path')).map(path => ({
            length: parseFloat(path.getAttribute('stroke-dasharray') ?? '1'),
            opacity: Number(getComputedStyle(path).opacity),
          })));
          if (performance.now() - start < 1100) requestAnimationFrame(sample);
          else resolve(frames);
        };
        queueMicrotask(sample);
      }, { once: true }));
    });
    await correct.click();
    const draw = await page.evaluate(() => window.__feedbackFrames);
    for (const index of [0, 1]) {
      const samples = draw.flatMap(frame => frame[index] ? [frame[index]] : []);
      assert.ok(samples.length > 3, 'verdict exists throughout its drawing');
      for (let frame = 1; frame < samples.length; frame++) {
        assert.ok(samples[frame].length >= samples[frame - 1].length - 0.015, 'the check never flashes complete then restarts');
        assert.ok(samples[frame].opacity >= samples[frame - 1].opacity - 0.015, 'the check never disappears after becoming visible');
      }
      assert.ok(samples.at(-1).length > 0.99 && samples.at(-1).opacity > 0.99, 'the verdict stays complete');
    }
    await settled(question);
    const graded = await correct.evaluate(node => getComputedStyle(node).backgroundColor);
    assert.notEqual(graded, idle, 'correct fill persists after feedback ends');

    const multiple = page.locator('#question-demo-multiple-001');
    const pick = multiple.locator('[data-option="A"]');
    const empty = await pick.evaluate(node => getComputedStyle(node).backgroundColor);
    await pick.click();
    await settled(multiple);
    assert.notEqual(await pick.evaluate(node => getComputedStyle(node).backgroundColor), empty, 'draft multi-selection retains its fill');
    await page.keyboard.press('Space');
    await settled(multiple);
    assert.equal(await pick.evaluate(node => getComputedStyle(node).backgroundColor), empty, 'keyboard deselection clears its fill');

    // Open while the page's feedback is still at its initial/intermediate
    // frame. A DOM clone must show the completed result immediately.
    const openings = [];
    for (let run = 0; run < 4; run++) {
      await question.getByRole('button', { name: '重做', exact: true }).click();
      const frames = await question.evaluate(async (node, run) => {
        node.querySelector(`[data-option="${run % 2 ? 'A' : 'C'}"]`).click();
        await new Promise(requestAnimationFrame);
        node.querySelector('[data-solution-trigger]').click();
        const frames = [];
        let until = performance.now() + 10000;
        let seen = false;
        while (performance.now() < until) {
          await new Promise(requestAnimationFrame);
          const sheet = document.querySelector('[data-solution-card]');
          if (!sheet) continue;
          if (!seen) { seen = true; until = performance.now() + 1000; }
          const mirror = sheet.querySelector('[data-question-mirror]');
          const badge = mirror?.querySelector('[data-choice-verdict]');
          frames.push({
            y: new DOMMatrix(getComputedStyle(sheet).transform).m42,
            rootHidden: sheet.querySelector('[data-slot="modal-root-page"]')?.hidden,
            mirror: !!mirror?.firstElementChild,
            badge: badge ? Number(getComputedStyle(badge).opacity) : null,
            strokes: Array.from(badge?.querySelectorAll('path, line') ?? []).map(path => parseFloat(path.getAttribute('stroke-dasharray') ?? '1')),
          });
        }
        return frames;
      }, run);
      assert.ok(frames.length > 3, 'drawer entrance is sampled');
      assert.ok(frames.every(frame => frame.mirror && !frame.rootHidden), 'the question never blanks during entrance');
      assert.ok(frames.every(frame => frame.badge === 1 && frame.strokes.every(length => length === 1)), 'the mirror never freezes or flashes an intermediate verdict');
      const sheet = page.locator('[data-solution-card]');
      await settled(sheet);
      assert.equal(await sheet.count(), 1, 'one shared drawer remains mounted');
      if (run === 0) await sheet.screenshot({ path: path.join(screenshots, `${name}-immediate-solution.png`) });
      await sheet.getByRole('button', { name: '关闭', exact: true }).click();
      await sheet.waitFor({ state: 'hidden' });
      openings.push(frames);
    }
    await question.getByRole('button', { name: '重做', exact: true }).click();
    await settled(question);
    assert.equal(await correct.evaluate(node => getComputedStyle(node).backgroundColor), idle, 'reset clears result background');
    await correct.click();
    await page.reload({ waitUntil: 'networkidle' });
    await question.locator('[data-feedback="correct"]').waitFor();
    await settled(question);
    assert.equal(await correct.evaluate(node => getComputedStyle(node).backgroundColor), graded, 'reload preserves grading fill');
    assert.equal(await correct.locator('[data-choice-verdict]').evaluate(node => getComputedStyle(node).opacity), '1', 'restored verdict is visible without replay');
    reports.push({ name, draw, openings });
    await context.close();
    console.log(`PASS ${name}: persistent backgrounds, monotonic checks, immediate solution, repeated open/close and restore`);
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  await writeFile(path.join(screenshots, 'feedback-regressions.json'), JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
}
