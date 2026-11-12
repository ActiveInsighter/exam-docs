import assert from 'node:assert/strict';
import {copyFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {base, launchBrowser, screenshots, settled} from './browser-ui-helpers.mjs';

// These checks inspect the transition itself, rather than only its final DOM.
await mkdir(screenshots, {recursive:true});
const browser=await launchBrowser();
const reports=[];
const errors=[];

async function sample(page, selector, count, stopWhenGone=false) {
  return page.evaluate(async ({selector,count,stopWhenGone})=>{
    const frames=[];
    for(let i=0;i<count;i++) {
      await new Promise(requestAnimationFrame);
      const node=document.querySelector(selector);
      if(!node) { if(stopWhenGone) break; else continue; }
      const style=getComputedStyle(node);
      const matrix=new DOMMatrix(style.transform);
      const parent=node.querySelector('[data-slot="modal-root-page"]');
      frames.push({y:matrix.m42,opacity:Number(style.opacity),page:node.querySelector('[data-slot="modal-pages"]')?.dataset.page,parentInert:parent?.inert,parentHidden:parent?.hidden});
    }
    return frames;
  },{selector,count,stopWhenGone});
}

try {
  for(const [name,options] of [
    ['desktop',{viewport:{width:1440,height:1000},colorScheme:'light'}],
    ['phone',{viewport:{width:390,height:844},colorScheme:'dark',isMobile:true,hasTouch:true}],
    ['reduced',{viewport:{width:1280,height:900},colorScheme:'light',reducedMotion:'reduce'}],
  ]) {
    const context=await browser.newContext({...options,...(process.env.QUESTION_RECORD_VIDEO==='1'?{recordVideo:{dir:path.join(screenshots,'videos'),size:options.viewport}}:{})});
    await context.addInitScript(theme=>localStorage.setItem('theme',theme),options.colorScheme);
    // Pace each animation without changing document.timeline: the official
    // primitives explicitly start WAAPI animations with performance.now().
    // CDP's global playback rate changes those clocks relative to each other.
    await context.addInitScript(() => {
      window.__reviewAnimationRate=1;
      const animate=Element.prototype.animate;
      Element.prototype.animate=function(...args) {
        const animation=animate.apply(this,args);
        queueMicrotask(()=>{if(animation.playState!=='idle')animation.updatePlaybackRate(window.__reviewAnimationRate)});
        return animation;
      };
      const seen=new WeakSet();
      const pace=()=>{
        for(const animation of document.getAnimations()) {
          if(seen.has(animation))continue;
          seen.add(animation);
          if(animation instanceof CSSTransition||animation instanceof CSSAnimation)animation.updatePlaybackRate(window.__reviewAnimationRate);
        }
        requestAnimationFrame(pace);
      };
      requestAnimationFrame(pace);
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/docs/question-types/`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#question-demo-single-001 [data-option]')?.getAttribute('aria-disabled')!=='true');
    const option=page.locator('#question-demo-single-001 [data-option="A"]');
    const before=await option.evaluate(node=>getComputedStyle(node).backgroundColor);
    // Start sampling at the click, before the automation round-trip returns.
    // Under recording or CI load, waiting for click() can miss a short effect.
    await option.evaluate(node=>{
      window.__choiceRippleFrames=new Promise(resolve=>node.addEventListener('click',async()=>{
        const result=[];
        for(let i=0;i<12;i++) {
          await new Promise(requestAnimationFrame);
          const circle=node.querySelector('[data-choice-ripple-layer] > span');
          if(!circle) continue;
          const css=getComputedStyle(circle);
          result.push({scale:new DOMMatrix(css.transform).a,opacity:Number(css.opacity),background:getComputedStyle(node).backgroundColor,layer:Number(getComputedStyle(circle.parentElement).zIndex)});
        }
        resolve(result);
      },{once:true}));
    });
    await option.click({position:{x:20,y:20}});
    const ripple=await page.evaluate(()=>window.__choiceRippleFrames);
    assert.ok(ripple.length>=2,'The visible ripple survives multiple frames');
    assert.ok(ripple.some(frame=>frame.opacity>0.05),'The expanding circle is visibly opaque');
    assert.ok(ripple.every(frame=>frame.background===before),'No whole-button fill masks the expanding ripple');
    assert.ok(ripple.every(frame=>frame.layer>=0),'The ripple is above the surface background');
    if(options.reducedMotion!=='reduce') assert.ok(ripple.at(-1).scale>ripple[0].scale+1,'The circle actually expands');
    else assert.ok(ripple.every(frame=>Math.abs(frame.scale-ripple[0].scale)<0.01),'Reduced-motion ripples fade without expansion');
    await option.screenshot({path:path.join(screenshots,`${name}-option.png`)});

    await page.evaluate(()=>{window.__reviewAnimationRate=0.35});
    await page.locator('#question-demo-single-001 [data-solution-trigger]').click();
    const sheet=page.locator('[data-solution-card]');
    await sheet.waitFor();
    const entering=await sample(page,'[data-solution-card]',65);
    assert.ok(entering.length>2);
    if(options.reducedMotion!=='reduce') assert.ok(Math.max(...entering.map(frame=>frame.y))>30,'Drawer entrance travels visibly from its edge');
    else assert.ok(entering.every(frame=>Math.abs(frame.y)<0.1),'Reduced drawer entrance stays in place');
    await settled(sheet);
    const libraryTrigger=sheet.getByRole('button',{name:'收藏与标签',exact:true});
    await libraryTrigger.click();
    const library=sheet.locator('[data-slot="modal-page"]');
    await library.waitFor();
    await settled(sheet);
    assert.equal(await library.locator('[data-slot="modal-title"]').evaluate(node=>document.activeElement===node),true);
    assert.equal(await sheet.getAttribute('aria-labelledby'),await library.locator('[data-slot="modal-title"]').getAttribute('id'),'Dialog name follows the visible page');
    assert.equal(await sheet.getAttribute('aria-describedby'),await library.locator('[data-slot="modal-description"]').getAttribute('id'),'Child description does not overwrite the root Drawer registration');
    const shown=await sheet.locator('[data-slot="modal-pages"]').getAttribute('data-page');
    await library.getByRole('button',{name:'全部关闭',exact:true}).click();
    const closing=await sample(page,'[data-solution-card]',120,true);
    assert.ok(closing.length>=2,'Drawer remains mounted throughout exit');
    assert.ok(closing.every(frame=>frame.page===shown),'Closing never switches back to the parent page');
    assert.ok(closing.every(frame=>frame.parentInert&&frame.parentHidden),'The parent never flashes during dismissal');
    if(options.reducedMotion!=='reduce') assert.ok(closing.some(frame=>frame.y>40),'Drawer exit travels visibly toward its edge');
    else {
      assert.ok(closing.every(frame=>Math.abs(frame.y)<0.1),'Reduced drawer exit stays in place');
      assert.ok(closing.some(frame=>frame.opacity<0.8),'Reduced drawer exit visibly fades');
    }
    await sheet.waitFor({state:'detached'});
    await page.locator('#question-demo-single-001 [data-solution-trigger]').click();
    await sheet.waitFor();await settled(sheet);
    assert.equal(await sheet.getByRole('button',{name:'收藏与标签',exact:true}).getAttribute('aria-expanded'),'false','Reopen resets child-page control state after exit');
    await page.evaluate(()=>{window.__reviewAnimationRate=1});
    await sheet.getByRole('button',{name:'关闭',exact:true}).click();
    await sheet.waitFor({state:'detached'});
    // Reverse a dismissal before it completes. Keep one live Drawer rather
    // than replacing it or leaving the reopened surface in an ending state.
    await page.locator('#question-demo-single-001 [data-solution-trigger]').click();
    await sheet.waitFor();
    await sheet.evaluate(async node=>{
      node.querySelector('[data-slot="modal-close"]').click();
      await new Promise(requestAnimationFrame);
      document.querySelector('#question-demo-single-001 [data-solution-trigger]').click();
    });
    await settled(sheet);
    assert.equal(await sheet.getAttribute('data-open'),'','An interrupted dismissal reopens the same Drawer');
    assert.equal(await page.locator('[data-slot="modal-content"]').count(),1);
    await sheet.getByRole('button',{name:'关闭',exact:true}).click();
    await sheet.waitFor({state:'detached'});
    reports.push({name,ripple,entering,closing});
    const video=page.video();
    await context.close();
    if(video) await copyFile(await video.path(),path.join(screenshots,`${name}-motion.webm`));
    console.log(`PASS ${name}: visible ripple, drawer entrance/exit, no parent flash, reopen and focus`);
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(screenshots,'motion-regressions.json'),JSON.stringify(reports,null,2));
} finally {await browser.close()}
