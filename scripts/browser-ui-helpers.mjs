import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

export const base = (process.env.DEPLOYMENT_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const screenshots = process.env.QUESTION_SCREENSHOTS ?? '/tmp/question-component-screenshots';

export async function launchBrowser() {
  const require = process.env.QUESTION_BROWSER_MODULES
    ? createRequire(path.join(path.resolve(process.env.QUESTION_BROWSER_MODULES), 'package.json'))
    : createRequire(import.meta.url);
  const { chromium } = require('playwright-core');
  return chromium.launch({
    channel: process.env.QUESTION_BROWSER_CHANNEL || undefined,
    executablePath: process.env.QUESTION_BROWSER_EXECUTABLE || undefined,
  });
}

/** Wait for layout and finite browser animations, including an overlay's exit. */
export async function settled(locator) {
  await locator.evaluate(async node => {
    for (let pass = 0; pass < 3; pass++) {
      await new Promise(requestAnimationFrame);
      const animations = node.getAnimations({ subtree: true }).filter(animation =>
        animation.playState !== 'finished' && animation.effect?.getComputedTiming().iterations !== Infinity);
      let timeout;
      try {
        await Promise.race([
          Promise.all(animations.map(animation => animation.finished.catch(() => {}))),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('UI animations did not settle within 5 seconds.')), 5000); }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
  });
}

export async function focused(locator) {
  assert.equal(await locator.evaluate(node => node === document.activeElement), true, 'focus returns to the intended control');
}

/** Sample real animation frames, without disabling motion as screenshots normally do. */
export async function frames(locator, count = 12) {
  return locator.evaluate(async (node, count) => {
    const samples = [];
    for (let index = 0; index < count; index++) {
      await new Promise(requestAnimationFrame);
      const style = getComputedStyle(node);
      const matrix = new DOMMatrix(style.transform);
      samples.push({ x: matrix.m41, y: matrix.m42, scale: matrix.a, opacity: Number(style.opacity) });
    }
    return samples;
  }, count);
}

export async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no horizontal page overflow');
}
