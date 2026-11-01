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

  var PREFIX = 'exam-diag:v1:', INDEX = PREFIX + 'index', MAX_EVENTS = 150;
  var t0 = Date.now();
  var sid = (t0.toString(36) + Math.random().toString(36).slice(2, 10)).replace(/[^a-z0-9]/g, '').slice(0, 24);
  var record = { sid: sid, start: t0, path: location.pathname, clean: false, hidden: null, ev: [], beat: null };
  var queue = [], flushTimer = 0, sent = 0;

  function now() { return Date.now() - t0; }
  function save() { try { ls.setItem(PREFIX + sid, JSON.stringify(record)); } catch (e) {} }
  function send(kind, session, events) {
    try {
      events = events.slice();
      var body = JSON.stringify({ p_session: session, p_kind: kind, p_events: events });
      while (new Blob([body]).size > 30000 && events.length) {
        events.splice(kind === 'previous' && events.length > 1 ? 1 : 0, 1);
        body = JSON.stringify({ p_session: session, p_kind: kind, p_events: events });
      }
      return fetch(ENDPOINT, { method: 'POST', keepalive: true, credentials: 'omit',
        headers: { apikey: KEY, 'content-type': 'application/json' }, body: body })
        .then(function (response) { return response.ok; }, function () { return false; });
    } catch (e) {}
    return Promise.resolve(false);
  }
  function flush() {
    clearTimeout(flushTimer); flushTimer = 0;
    if (sent >= 280) { queue = []; return; }
    if (!queue.length) return;
    sent++;
    var batch = queue; queue = [];
    send('live', sid, batch);
  }
  function log(type, data, urgent) {
    var entry = [now(), String(type).slice(0, 40), data === undefined ? null : data];
    record.ev.push(entry);
    if (record.ev.length > MAX_EVENTS) record.ev.splice(0, record.ev.length - MAX_EVENTS);
    save();
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
      if (!raw) continue;
      var prev = JSON.parse(raw);
      var seen = prev.start + (prev.beat ? prev.beat.t : 0);
      // Another tab still beating: leave it alone.
      if (!prev.clean && t0 - seen < 6000) { keep.push(index[i]); continue; }
      if (!prev.clean) {
        keep.push(index[i]);
        send('previous', prev.sid, [[0, 'cut-off', { path: prev.path, start: prev.start, lastBeat: prev.beat,
          hiddenAt: prev.hidden, sinceLastBeat: t0 - seen }]].concat(prev.ev.slice(-100)))
          .then((function (key) { return function (ok) { if (ok) { try { ls.removeItem(key); } catch (e) {} } }; })(PREFIX + index[i]));
      } else {
        ls.removeItem(PREFIX + index[i]);
      }
    }
    keep.push(sid);
    while (keep.length > 5) ls.removeItem(PREFIX + keep.shift());
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
    signedIn: signedIn, lsKB: Math.round(lsChars / 512), history: history.length, scrollY: Math.round(w.scrollY)
  }, true);
  try {
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(safe(function (s) {
      log('storage', { usageMB: Math.round(s.usage / 1048576), quotaMB: Math.round(s.quota / 1048576) });
    }), function () {});
  } catch (e) {}

  var longTasks = 0, longMs = 0, logged = 0, beats = 0;
  try {
    new PerformanceObserver(safe(function (list) {
      list.getEntries().forEach(function (e) {
        longTasks++; longMs += e.duration;
        if (e.duration > 300 && logged++ < 40) log('long-task', { ms: Math.round(e.duration), at: Math.round(e.startTime) });
      });
    })).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver(safe(function (list) {
      list.getEntries().forEach(function (e) { log(e.name, { at: Math.round(e.startTime) }); });
    })).observe({ type: 'paint', buffered: true });
  } catch (e) {}

  function beat() {
    beats++;
    var m = P.memory;
    var b = {
      t: now(), heap: m ? Math.round(m.usedJSHeapSize / 1048576) : null, heapTotal: m ? Math.round(m.totalJSHeapSize / 1048576) : null,
      dom: d.getElementsByTagName('*').length, y: Math.round(w.scrollY), h: d.documentElement.scrollHeight,
      vis: d.visibilityState, path: location.pathname, long: longTasks, longMs: Math.round(longMs),
      keypad: !!d.querySelector('[data-math-keypad]'),
      answered: d.querySelectorAll('[data-attempt-result]:not([data-attempt-result="idle"])').length
    };
    record.beat = b;
    save();
    // Every 4 s for the first minute, then every 30 s.
    if (b.t < 60000 ? beats % 2 === 0 : beats % 15 === 0) { queue.push([b.t, 'beat', b]); flush(); }
  }
  setInterval(safe(beat), 2000);

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
  d.addEventListener('readystatechange', safe(function () { log('ready-' + d.readyState, { dom: d.getElementsByTagName('*').length }); }));
  w.addEventListener('load', safe(function () { log('load', { dom: d.getElementsByTagName('*').length }, true); }));
  d.addEventListener('visibilitychange', safe(function () {
    if (d.visibilityState === 'hidden') record.hidden = now();
    log('visibility', d.visibilityState, d.visibilityState === 'hidden');
  }));
  d.addEventListener('freeze', safe(function () { log('freeze', null, true); }));
  d.addEventListener('resume', safe(function () { log('resume'); }));
  w.addEventListener('pageshow', safe(function (e) { if (e.persisted) { record.clean = false; log('pageshow-bfcache'); } }));
  w.addEventListener('pagehide', safe(function (e) { record.clean = true; log('pagehide', { persisted: e.persisted }, true); save(); }));
})();`;

export function CrashDiagnosticsScript() {
  const endpoint = diagnosticsEndpoint();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!endpoint || !key) return null;
  const code = `var ENDPOINT=${JSON.stringify(endpoint)},KEY=${JSON.stringify(key)};${SOURCE}`;
  // Same as the other configuration scripts: one IIFE, executed during parsing.
  return <script dangerouslySetInnerHTML={{ __html: `(function(){${code}})();` }} />;
}
