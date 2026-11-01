/*
 * Temporary crash diagnostics (2026-11-01). The HarmonyOS Huawei browser
 * kills some pages outright, sometimes again on every restore, and leaves no
 * log. This inline script runs first in <head>, before the page is parsed or
 * any bundle loads, on that engine only (or anywhere with ?diag=1; ?diag=0
 * disables it). It keeps a trail of the visit in localStorage and
 * posts it to exam_private.client_diagnostics as it goes; a trail that was
 * cut off is sent again, whole, on the next visit. Components add milestones
 * through lib/diagnostics.ts.
 *
 * It has to stay cheap on a page with ~10k DOM nodes: the 2 s heartbeat writes
 * only a small separate key, DOM-wide reads run at most every 10 s while
 * visible, the trail is rewritten once per task that logs something, and no
 * more than four uploads are in flight. Uploads use keepalive only while the
 * page is hidden; otherwise they give up after 15 s and record the timeout.
 * For 30 s after boot and after each return to the page it keeps a denser
 * trail (timer lag, a one-at-a-time requestAnimationFrame probe, pending and
 * failed uploads, online state) to tell a stuck renderer from stuck
 * JavaScript or a dead network stack.
 *
 * Remove with lib/diagnostics.ts and the migration's table once the crash is
 * understood.
 */

function diagnosticsEndpoint(): string | null {
  const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const proxy = process.env.NEXT_PUBLIC_SUPABASE_PROXY_PATH;
  if (!project || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  return `${(proxy || project).replace(/\/$/, '')}/rest/v1/rpc/exam_client_log`;
}

const SOURCE = String.raw`(function () {
  var w = window, d = document, ls, P = performance;
  try { ls = w.localStorage; ls.length; } catch (e) { return; }
  var ua = navigator.userAgent || '';
  var override = null;
  try {
    var param = new URLSearchParams(location.search).get('diag');
    if (param === '0' || param === '1') ls.setItem('exam-diag:force', param);
    override = ls.getItem('exam-diag:force');
  } catch (e) {}
  if (override === '0' || (override !== '1' && !/OpenHarmony|HarmonyOS|ArkWeb|HuaweiBrowser/i.test(ua))) return;
  if (w.__examDiag) return;

  var PREFIX = 'exam-diag:v1:', INDEX = PREFIX + 'index', MAX_EVENTS = 150, MAX_BYTES = 30000, MAX_INFLIGHT = 4;
  var t0 = Date.now();
  var sid = (t0.toString(36) + Math.random().toString(36).slice(2, 10)).replace(/[^a-z0-9]/g, '').slice(0, 24);
  // The trail is rewritten only when an event is added; the 2 s heartbeat goes to its own small key.
  var RECORD_KEY = PREFIX + sid, BEAT_KEY = RECORD_KEY + ':b';
  var record = { sid: sid, start: t0, path: location.pathname, clean: false, hidden: null, ev: [] };
  var queue = [], flushTimer = 0, sent = 0, dirty = false, saveQueued = false;
  var inflight = 0, netFail = 0, lastOk = null, reqId = 0, pend = {}, slowLogged = 0;
  var Abort = w.AbortController, TIMEOUT = 15000, conn = navigator.connection;

  function now() { return Date.now() - t0; }
  function save() {
    saveQueued = false;
    if (!dirty) return;
    dirty = false;
    try { ls.setItem(RECORD_KEY, JSON.stringify(record)); } catch (e) {}
  }
  // Events logged in one task (answers read, restored, ...) share one write, still before the task ends.
  function saveSoon() {
    dirty = true;
    if (!saveQueued) { saveQueued = true; Promise.resolve().then(save); }
  }
  function forget(id) { try { ls.removeItem(PREFIX + id); ls.removeItem(PREFIX + id + ':b'); } catch (e) {} }
  // UTF-8 size, over-counting astral characters; only measured when the length alone cannot rule it out.
  function tooBig(body) {
    if (body.length * 3 <= MAX_BYTES) return false;
    var n = body.length;
    for (var i = 0; i < body.length; i++) { var c = body.charCodeAt(i); if (c > 127) n += c > 2047 ? 2 : 1; }
    return n > MAX_BYTES;
  }
  function remember(entry) {
    record.ev.push(entry);
    if (record.ev.length > MAX_EVENTS) record.ev.splice(0, record.ev.length - MAX_EVENTS);
    saveSoon();
  }
  // "type/effectiveType/rtt/downlink", e.g. "wifi/4g/50/10"; null where the Network Information API is missing.
  function network() { return conn ? (conn.type || '') + '/' + (conn.effectiveType || '') + '/' + conn.rtt + '/' + conn.downlink : null; }
  function pendingMs() {
    var t = now(), age = null;
    for (var id in pend) if (age === null || t - pend[id] > age) age = t - pend[id];
    return age;
  }
  // status: HTTP status, 0 for a network error, 'timeout' when we gave up waiting.
  function failed(status, ms, keep) {
    netFail++;
    // Local only: queueing it would only add to what cannot be sent.
    if (netFail <= 3 || netFail % 10 === 0) remember([now(), 'send-fail', { n: netFail, status: status, ms: ms, keepalive: keep,
      pending: inflight, online: navigator.onLine, network: network() }]);
  }
  function send(kind, session, events) {
    try {
      events = events.slice();
      var body = JSON.stringify({ p_session: session, p_kind: kind, p_events: events });
      while (tooBig(body) && events.length) {
        var drop = Math.max(1, events.length >> 2);
        if (kind === 'previous' && events.length > 1) events.splice(1, Math.min(drop, events.length - 1));
        else events.splice(0, drop);
        body = JSON.stringify({ p_session: session, p_kind: kind, p_events: events });
      }
      // keepalive only when the page may be going away. Otherwise a plain request that gives up after
      // 15 s, so a wedged connection shows as a timeout, and ArkWeb's keepalive path is not involved.
      var keep = d.visibilityState === 'hidden', ctrl = !keep && Abort ? new Abort() : null;
      var id = ++reqId, start = now(), timer = 0;
      var init = { method: 'POST', keepalive: keep, credentials: 'omit',
        headers: { apikey: KEY, 'content-type': 'application/json' }, body: body };
      if (ctrl) init.signal = ctrl.signal;
      var request = fetch(ENDPOINT, init);
      inflight++; pend[id] = start;
      if (ctrl) timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
      var settle = function () { inflight--; delete pend[id]; clearTimeout(timer); return now() - start; };
      return request.then(function (response) {
        var ms = settle();
        if (!response.ok) failed(response.status, ms, keep);
        else {
          lastOk = now();
          if (ms > 5000 && slowLogged++ < 20) remember([now(), 'send-slow', { ms: ms, keepalive: keep }]);
        }
        return response.ok;
      }, function () { var ms = settle(); failed(ctrl && ctrl.signal.aborted ? 'timeout' : 0, ms, keep); return false; });
    } catch (e) {}
    return Promise.resolve(false);
  }
  function flush() {
    clearTimeout(flushTimer); flushTimer = 0;
    save();
    if (sent >= 280) { queue = []; return; }
    if (!queue.length) return;
    // A wedged network stack keeps requests pending; do not pile more on, retry later.
    if (inflight >= MAX_INFLIGHT) { flushTimer = setTimeout(flush, 4000); return; }
    sent++;
    var batch = queue; queue = [];
    send('live', sid, batch);
  }
  function log(type, data, urgent) {
    var entry = [now(), String(type).slice(0, 40), data === undefined ? null : data];
    remember(entry);
    queue.push(entry);
    if (queue.length > MAX_EVENTS) queue.splice(0, queue.length - MAX_EVENTS);
    if (urgent) flush(); else if (!flushTimer) flushTimer = setTimeout(flush, 1500);
  }
  function safe(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) {} }; }
  w.__examDiag = safe(function (type, data, urgent) { log(type, data, urgent); });

  // Missing pagehide may mean a killed renderer or an OS-discarded tab.
  try {
    var index = JSON.parse(ls.getItem(INDEX) || '[]'), keep = [];
    for (var i = 0; i < index.length; i++) {
      var raw = ls.getItem(PREFIX + index[i]);
      if (!raw) { forget(index[i]); continue; }
      var prev = JSON.parse(raw), beatRaw = ls.getItem(PREFIX + index[i] + ':b');
      var last = beatRaw ? JSON.parse(beatRaw) : prev.beat || null;
      var seen = prev.start + (last ? last.t : 0);
      // Another tab still beating: leave it alone.
      if (!prev.clean && t0 - seen < 6000) { keep.push(index[i]); continue; }
      if (!prev.clean) {
        keep.push(index[i]);
        send('previous', prev.sid, [[0, 'cut-off', { path: prev.path, start: prev.start, lastBeat: last,
          hiddenAt: prev.hidden, sinceLastBeat: t0 - seen }]].concat(prev.ev.slice(-100)))
          .then((function (id) { return function (ok) { if (ok) forget(id); }; })(index[i]));
      } else {
        forget(index[i]);
      }
    }
    keep.push(sid);
    while (keep.length > 5) forget(keep.shift());
    ls.setItem(INDEX, JSON.stringify(keep));
  } catch (e) { try { ls.setItem(INDEX, JSON.stringify([sid])); } catch (e2) {} }

  var mem = P.memory, nav = (P.getEntriesByType && P.getEntriesByType('navigation')[0]) || {};
  var lsChars = 0, signedIn = false;
  try {
    for (var k = 0; k < ls.length; k++) {
      var key = ls.key(k) || '';
      lsChars += key.length + (ls.getItem(key) || '').length;
      if (/^sb-.*-auth-token/.test(key)) signedIn = true;
    }
  } catch (e) {}
  log('boot', {
    path: location.pathname.slice(0, 200), nav: nav.type || null, ua: ua.slice(0, 300),
    vw: w.innerWidth, vh: w.innerHeight, dpr: w.devicePixelRatio, dm: navigator.deviceMemory || null,
    cores: navigator.hardwareConcurrency || null, heapLimit: mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : null,
    signedIn: signedIn, lsKB: Math.round(lsChars / 512), history: history.length, scrollY: Math.round(w.scrollY),
    online: navigator.onLine, network: network()
  }, true);
  try {
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(safe(function (s) {
      log('storage', { usageMB: Math.round(s.usage / 1048576), quotaMB: Math.round(s.quota / 1048576) });
    }), function () {});
  } catch (e) {}

  var types = (w.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
  var hasLoaf = types.indexOf('long-animation-frame') >= 0;
  function observe(type, each, options) {
    try {
      var o = { type: type, buffered: true };
      for (var name in options) o[name] = options[name];
      new PerformanceObserver(safe(function (list) { list.getEntries().forEach(each); })).observe(o);
    } catch (e) {}
  }
  function ms(x) { return Math.round(x); }
  var longTasks = 0, longMs = 0, logged = 0, frames = 0, inputs = 0, lastInput = 0;
  observe('longtask', function (e) {
    longTasks++; longMs += e.duration;
    if (!hasLoaf && e.duration > 300 && logged++ < 40) log('long-task', { ms: ms(e.duration), at: ms(e.startTime) });
  });
  // A long frame also covers style, layout and paint, which a long task misses.
  observe('long-animation-frame', function (e) {
    if (e.duration <= 300 || frames++ >= 40) return;
    var end = e.startTime + e.duration, s = e.scripts && e.scripts[0];
    log('long-frame', { ms: ms(e.duration), at: ms(e.startTime), blocking: ms(e.blockingDuration || 0),
      layout: e.styleAndLayoutStart ? ms(end - e.styleAndLayoutStart) : 0, render: e.renderStart ? ms(end - e.renderStart) : 0,
      script: s ? String(s.invoker || s.sourceURL || '').slice(-80) : null });
  });
  // Taps the page took long to answer: what a "frozen" page feels like. One entry per interaction.
  observe('event', function (e) {
    if (e.duration < 300 || !e.interactionId || e.interactionId === lastInput || inputs++ >= 30) return;
    lastInput = e.interactionId;
    log('slow-input', { name: e.name, ms: ms(e.duration), at: ms(e.startTime),
      delay: ms(e.processingStart - e.startTime), handlers: ms(e.processingEnd - e.processingStart) });
  }, { durationThreshold: 300 });
  observe('paint', function (e) { log(e.name, { at: ms(e.startTime) }); });

  // Frame probe: one requestAnimationFrame at a time. Timers that keep firing while
  // frames stop mean rendering (not JavaScript) is stuck.
  var raf = w.requestAnimationFrame, frameGen = 0, frameAsked = null, frameMs = null, stalled = false;
  function probeFrame(resumeAway) {
    if (!raf || frameAsked !== null) return;
    var gen = frameGen, asked = frameAsked = now();
    stalled = false;
    raf.call(w, safe(function () {
      if (gen !== frameGen) return;
      var wait = now() - asked;
      frameAsked = null; frameMs = wait;
      if (resumeAway !== undefined) log('resume-frame', { ms: wait, away: resumeAway });
      else if (stalled || wait > 1000) log('frame-late', { ms: wait }, stalled);
    }));
  }
  function frameState() { return frameAsked !== null ? -(now() - frameAsked) : frameMs; }

  var els = d.getElementsByTagName('*'), metrics = null, metricsAt = 0;
  // DOM-wide reads (and scrollHeight, which forces layout) run while visible, at most every 10 s.
  function measure() {
    return { dom: els.length, y: Math.round(w.scrollY), h: d.documentElement.scrollHeight,
      keypad: !!d.querySelector('[data-math-keypad]'),
      answered: d.querySelectorAll('[data-attempt-result]:not([data-attempt-result="idle"])').length };
  }
  var beats = 0, lastTick = 0, burstUntil = 30000;
  function beat(light) {
    beats++;
    var t = now(), visible = d.visibilityState === 'visible';
    var lag = visible && lastTick ? t - lastTick - 2000 : null;
    lastTick = visible ? t : 0;
    // Uploads every 6 s for 30 s after boot and after each return to the page, then every 30 s;
    // the 2 s ticks in between stay in the local trail.
    var burst = visible && t < burstUntil, report = !light && (burst ? beats % 3 === 0 : beats % 15 === 0);
    if (visible && !light && (!metrics || t - metricsAt >= 10000)) { metrics = measure(); metricsAt = t; }
    var m = P.memory, b = {
      t: t, vis: d.visibilityState, path: location.pathname, lag: lag, frame: frameState(),
      heap: m ? Math.round(m.usedJSHeapSize / 1048576) : null, heapTotal: m ? Math.round(m.totalJSHeapSize / 1048576) : null,
      long: longTasks, longMs: Math.round(longMs), pending: inflight, pendingMs: pendingMs(), failed: netFail, lastOk: lastOk,
      online: navigator.onLine, network: network()
    };
    if (metrics) for (var name in metrics) b[name] = metrics[name];
    try { ls.setItem(BEAT_KEY, JSON.stringify(b)); } catch (e) {}
    if (visible) {
      if (frameAsked !== null && !stalled && t - frameAsked > 3000) { stalled = true; log('frame-stall', { ms: t - frameAsked, pending: inflight }, true); }
      probeFrame();
    }
    // Keep a dense local trail around boot and returns, where the browser has been dying.
    if (burst) remember([t, 'tick', { lag: lag, frame: b.frame, pending: inflight, pendingMs: b.pendingMs, failed: netFail,
      long: longTasks, online: b.online }]);
    if (report) { queue.push([t, 'beat', b]); flush(); }
  }
  setInterval(safe(function () { beat(false); }), 2000);

  w.addEventListener('error', safe(function (e) {
    var t = e.target;
    if (t && t !== w && t.tagName) log('resource-error', { tag: t.tagName, src: String(t.src || t.href || '').slice(0, 200) }, true);
    else log('error', { msg: String(e.message).slice(0, 300), src: String(e.filename || '').slice(-120), line: e.lineno, col: e.colno,
      stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 1200) : null }, true);
  }), true);
  w.addEventListener('unhandledrejection', safe(function (e) {
    var r = e.reason;
    log('rejection', { msg: String(r && r.message || r).slice(0, 300), stack: r && r.stack ? String(r.stack).slice(0, 1200) : null }, true);
  }));
  d.addEventListener('readystatechange', safe(function () { log('ready-' + d.readyState, { dom: els.length }); }));
  w.addEventListener('load', safe(function () { log('load', { dom: els.length }, true); }));
  d.addEventListener('visibilitychange', safe(function () {
    var t = now();
    frameGen++; frameAsked = null;
    if (d.visibilityState === 'hidden') {
      record.hidden = t;
      log('visibility', 'hidden', true);
      return;
    }
    var away = record.hidden === null ? null : t - record.hidden;
    burstUntil = t + 30000; lastTick = 0;
    // Sent at once: whether it arrives shows whether the network still works after the return.
    log('visibility', 'visible', true);
    probeFrame(away);
    beat(true);
  }));
  // Whether the device lost or changed its network around a return to the page.
  w.addEventListener('online', safe(function () { log('online', { network: network() }, true); }));
  w.addEventListener('offline', safe(function () { log('offline', { network: network() }, true); }));
  var changes = 0;
  try {
    if (conn && conn.addEventListener) conn.addEventListener('change', safe(function () {
      if (changes++ < 40) log('network', { network: network(), online: navigator.onLine });
    }));
  } catch (e) {}
  d.addEventListener('freeze', safe(function () { log('freeze', null, true); }));
  d.addEventListener('resume', safe(function () { log('resume'); }));
  w.addEventListener('pageshow', safe(function (e) { if (e.persisted) { record.clean = false; log('pageshow-bfcache'); } }));
  w.addEventListener('pagehide', safe(function (e) { record.clean = true; log('pagehide', { persisted: e.persisted }, true); }));
})();`;

export function CrashDiagnosticsScript() {
  const endpoint = diagnosticsEndpoint();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!endpoint || !key) return null;
  const code = `var ENDPOINT=${JSON.stringify(endpoint)},KEY=${JSON.stringify(key)};${SOURCE}`;
  // Same as the other configuration scripts: one IIFE, executed during parsing.
  return <script dangerouslySetInnerHTML={{ __html: `(function(){${code}})();` }} />;
}
