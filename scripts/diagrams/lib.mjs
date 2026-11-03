/*
 * Tiny SVG toolkit for the solution diagrams (components/mdx/algo-figure.tsx).
 *
 * A figure is drawn once with semantic classes; `save()` writes two files,
 * `<name>.svg` (light theme) and `<name>-dark.svg` (dark theme), that differ
 * only in the palette block of their <style>. Everything sits on a
 * transparent ground so the figure blends into whatever card holds it.
 *
 *   const f = new Fig(640, 240);
 *   f.array(40, 60, [3, 1, 4], { tones: { 1: 'blue' } });
 *   f.save('2010-42-1');
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT_DIR = join(ROOT, 'public/img/408/past-exams-large-questions/01-数据结构/solutions');
export const URL_BASE = '/img/408/past-exams-large-questions/01-数据结构/solutions';

export const TONES = ['blue', 'green', 'amber', 'red', 'violet', 'teal', 'gray'];

// [stroke / accent, soft fill, text ink]
const LIGHT = {
  ink: '#0f172a', sub: '#475569', mute: '#94a3b8', line: '#64748b', faint: '#cbd5e1',
  surface: '#ffffff', panel: '#f1f5f9', panelLine: '#e2e8f0',
  blue: ['#2563eb', '#dbeafe', '#1d4ed8'],
  green: ['#059669', '#d1fae5', '#047857'],
  amber: ['#d97706', '#fef3c7', '#b45309'],
  red: ['#dc2626', '#fee2e2', '#b91c1c'],
  violet: ['#7c3aed', '#ede9fe', '#6d28d9'],
  teal: ['#0891b2', '#cffafe', '#0e7490'],
  gray: ['#64748b', '#e2e8f0', '#475569'],
};
const DARK = {
  ink: '#e6e7ea', sub: '#a9adb6', mute: '#6b7079', line: '#8a909b', faint: '#454a53',
  surface: '#26292f', panel: '#1d2025', panelLine: '#30343b',
  blue: ['#60a5fa', '#1e3a6e', '#93c5fd'],
  green: ['#34d399', '#0f4a3a', '#6ee7b7'],
  amber: ['#fbbf24', '#523a0c', '#fcd34d'],
  red: ['#f87171', '#5c1d1d', '#fca5a5'],
  violet: ['#a78bfa', '#3b2a6b', '#c4b5fd'],
  teal: ['#22d3ee', '#0e4452', '#67e8f9'],
  gray: ['#9ca3af', '#3a3e46', '#d1d5db'],
};

function paletteVars(p) {
  const v = [`--ink:${p.ink}`, `--sub:${p.sub}`, `--mute:${p.mute}`, `--line:${p.line}`, `--faint:${p.faint}`,
    `--surface:${p.surface}`, `--panel:${p.panel}`, `--panel-line:${p.panelLine}`];
  for (const t of TONES) v.push(`--${t}:${p[t][0]}`, `--${t}-bg:${p[t][1]}`, `--${t}-ink:${p[t][2]}`);
  return `svg{${v.join(';')}}`;
}

const BASE_CSS = [
  `text{font-family:Inter,'PingFang SC','Microsoft YaHei','Noto Sans CJK SC','Noto Sans SC',system-ui,sans-serif;font-size:14px;fill:var(--ink)}`,
  `.mono{font-family:'JetBrains Mono','SF Mono',Menlo,Consolas,'Noto Sans Mono',monospace}`,
  `.it{font-style:italic;font-family:'Times New Roman','STIX Two Text',serif}`,
  `.b{font-weight:600}`, `.sub{fill:var(--sub)}`, `.mute{fill:var(--mute)}`,
  `.ln{stroke:var(--line);fill:none}`,
  `.faint{stroke:var(--faint)}`,
  `.surface{fill:var(--surface)}`, `.panel{fill:var(--panel);stroke:var(--panel-line)}`,
  `.box{fill:var(--surface);stroke:var(--line)}`,
  `.dash{stroke-dasharray:5 4}`, `.dot{stroke-dasharray:2 3}`,
  `.ghost{opacity:.38}`,
  `.ah-line{fill:var(--line)}`,
  ...TONES.flatMap((t) => [
    `.s-${t}{stroke:var(--${t})}`, `.f-${t}{fill:var(--${t}-bg)}`, `.solid-${t}{fill:var(--${t})}`,
    `.c-${t}{fill:var(--${t}-ink)}`, `.ah-${t}{fill:var(--${t})}`,
  ]),
].join('');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `a_{1}`, `a_1`, `x^{2}` become sub / superscript tspans; `*text*` italic. */
function richText(s, size) {
  const str = String(s);
  if (!/[_^*]/.test(str)) return esc(str);
  let out = '';
  let i = 0;
  const small = Math.round(size * 0.72);
  while (i < str.length) {
    const ch = str[i];
    if ((ch === '_' || ch === '^') && i + 1 < str.length) {
      let body;
      if (str[i + 1] === '{') {
        const end = str.indexOf('}', i + 2);
        body = str.slice(i + 2, end);
        i = end + 1;
      } else {
        body = str[i + 1];
        i += 2;
      }
      const shift = ch === '_' ? size * 0.28 : -size * 0.38;
      out += `<tspan dy="${shift.toFixed(1)}" font-size="${small}">${esc(body)}</tspan><tspan dy="${(-shift).toFixed(1)}">​</tspan>`;
    } else if (ch === '*') {
      const end = str.indexOf('*', i + 1);
      if (end < 0) { out += '*'; i += 1; continue; }
      out += `<tspan class="it">${esc(str.slice(i + 1, end))}</tspan>`;
      i = end + 1;
    } else {
      let j = i;
      while (j < str.length && !'_^*'.includes(str[j])) j += 1;
      out += esc(str.slice(i, j));
      i = j;
    }
  }
  return out;
}

const n = (v) => (Math.round(v * 10) / 10).toString();

export class Fig {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.parts = [];
    this.markers = new Set();
  }

  raw(s) { this.parts.push(s); return this; }

  cls(base, o = {}) {
    const c = [base];
    if (o.cls) c.push(o.cls);
    if (o.dash) c.push('dash');
    if (o.dot) c.push('dot');
    if (o.ghost) c.push('ghost');
    return c.filter(Boolean).join(' ');
  }

  /* ---------- primitives ---------- */

  text(x, y, s, o = {}) {
    const size = o.size ?? 14;
    const c = [];
    if (o.mono) c.push('mono');
    if (o.bold) c.push('b');
    if (o.tone) c.push(`c-${o.tone}`);
    if (o.muted) c.push('mute');
    if (o.subtle) c.push('sub');
    if (o.italic) c.push('it');
    if (o.ghost) c.push('ghost');
    if (o.cls) c.push(o.cls);
    const anchor = o.anchor ?? 'middle';
    const attrs = [`x="${n(x)}"`, `y="${n(y)}"`, `text-anchor="${anchor}"`, `dominant-baseline="${o.baseline ?? 'central'}"`];
    if (size !== 14) attrs.push(`style="font-size:${size}px"`);
    if (c.length) attrs.push(`class="${c.join(' ')}"`);
    if (o.rotate) attrs.push(`transform="rotate(${o.rotate} ${n(x)} ${n(y)})"`);
    this.parts.push(`<text ${attrs.join(' ')}>${richText(s, size)}</text>`);
    return this;
  }

  rect(x, y, w, h, o = {}) {
    const t = o.tone;
    let c;
    if (o.panel) c = 'panel';
    else if (t) c = `${o.fill === false ? '' : `f-${t}`} s-${t}`;
    else c = o.fill === false ? 'ln' : 'box';
    if (o.solid) c = `solid-${o.solid}`;
    const sw = o.sw ?? (t ? 1.6 : 1.4);
    const style = o.fill === false ? ' fill="none"' : '';
    this.parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${o.rx ?? 6}" class="${this.cls(c, o)}" stroke-width="${sw}"${style}/>`);
    return this;
  }

  circle(cx, cy, r, o = {}) {
    const t = o.tone;
    let c = t ? `f-${t} s-${t}` : 'box';
    if (o.fill === false) c = t ? `s-${t}` : 'ln';
    if (o.solid) c = `solid-${o.solid}`;
    const style = o.fill === false ? ' fill="none"' : '';
    this.parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" class="${this.cls(c, o)}" stroke-width="${o.sw ?? (t ? 1.8 : 1.4)}"${style}/>`);
    return this;
  }

  marker(tone) {
    const id = `ah-${tone ?? 'line'}`;
    this.markers.add(id);
    return id;
  }

  path(d, o = {}) {
    const c = o.tone ? `s-${o.tone}` : 'ln';
    const extra = [];
    if (o.arrow === 'end' || o.arrow === 'both' || o.arrow === true) extra.push(`marker-end="url(#${this.marker(o.tone)})"`);
    if (o.arrow === 'start' || o.arrow === 'both') extra.push(`marker-start="url(#${this.marker(o.tone)})"`);
    const fill = o.fillTone ? `class="${this.cls(`f-${o.fillTone} ${c}`, o)}"` : `class="${this.cls(c, o)}" fill="none"`;
    this.parts.push(`<path d="${d}" ${fill} stroke-width="${o.sw ?? 1.6}" stroke-linecap="round" stroke-linejoin="round" ${extra.join(' ')}/>`);
    return this;
  }

  line(x1, y1, x2, y2, o = {}) {
    return this.path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, o);
  }

  /** Quadratic curve; `bend` pushes the control point off the chord (px, +left). */
  curve(x1, y1, x2, y2, bend, o = {}) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * bend;
    const cy = my + (dx / len) * bend;
    return this.path(`M${n(x1)} ${n(y1)}Q${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}`, o);
  }

  /* ---------- composite pieces ---------- */

  /** Rounded label chip, centred on (x, y). */
  chip(x, y, s, o = {}) {
    const size = o.size ?? 12;
    const w = o.w ?? Math.max(22, textWidth(s, size, o.mono) + 14);
    const h = o.h ?? size + 10;
    if (o.tone) this.rect(x - w / 2, y - h / 2, w, h, { tone: o.tone, rx: h / 2, sw: 1.2 });
    else this.rect(x - w / 2, y - h / 2, w, h, { rx: h / 2, sw: 1.1 });
    this.text(x, y + 0.5, s, { size, tone: o.tone, bold: o.bold ?? true, mono: o.mono });
    return this;
  }

  /** Solid pill with white-ish text (strong emphasis). */
  pill(x, y, s, tone, o = {}) {
    const size = o.size ?? 12;
    const w = o.w ?? Math.max(22, textWidth(s, size) + 20);
    const h = size + 10;
    this.raw(`<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${h}" rx="${h / 2}" class="solid-${tone}"/>`);
    this.raw(`<text x="${n(x)}" y="${n(y + 0.5)}" text-anchor="middle" dominant-baseline="central" class="b" style="fill:var(--surface);font-size:${size}px">${richText(s, size)}</text>`);
    return this;
  }

  panel(x, y, w, h, title, o = {}) {
    this.rect(x, y, w, h, { panel: true, rx: o.rx ?? 10, sw: 1 });
    if (title) this.text(x + 14, y + 18, title, { anchor: 'start', size: o.titleSize ?? 13, bold: true, subtle: !o.tone, tone: o.tone });
    return this;
  }

  /** Circle node with centred label. */
  node(cx, cy, label, o = {}) {
    const r = o.r ?? 18;
    this.circle(cx, cy, r, { tone: o.tone, ghost: o.ghost, dash: o.dash, sw: o.sw });
    this.text(cx, cy + 0.5, label, { size: o.size ?? (String(label).length > 2 ? 12 : 14), bold: o.bold ?? true, tone: o.tone, mono: o.mono, ghost: o.ghost });
    return this;
  }

  /** Arrow pointing at (x, y) from `len` px above (dir 'down') or below ('up'), label at the tail. */
  pointer(x, y, label, o = {}) {
    const len = o.len ?? 26;
    const dir = o.dir ?? 'down';
    const tone = o.tone ?? 'blue';
    const sy = dir === 'down' ? y - len : y + len;
    this.line(x, sy, x, dir === 'down' ? y - 3 : y + 3, { tone, arrow: 'end', sw: 1.8 });
    const ly = dir === 'down' ? sy - 10 : sy + 11;
    this.text(x, ly, label, { size: o.size ?? 13, bold: true, tone, mono: o.mono ?? true });
    return this;
  }

  /** Horizontal bracket from x1 to x2 at y, opening toward the content. */
  brace(x1, x2, y, label, o = {}) {
    const dir = o.dir ?? 'down'; // 'down': bracket below content, label underneath
    const tone = o.tone;
    const h = o.h ?? 7;
    const s = dir === 'down' ? 1 : -1;
    this.path(`M${n(x1)} ${n(y - s * h)}L${n(x1)} ${n(y)}L${n(x2)} ${n(y)}L${n(x2)} ${n(y - s * h)}`, { tone, sw: 1.4 });
    if (label) this.text((x1 + x2) / 2, y + s * 13, label, { size: o.size ?? 12.5, tone, bold: o.bold ?? false, subtle: !tone, mono: o.mono });
    return this;
  }

  /**
   * A row of cells. Returns { cx(i), x(i), y, w, h, right }.
   * o.tones: {index: tone}, o.ghost: Set/array of dimmed indices,
   * o.idx: true | number (start) for index labels, o.idxPos: 'above' | 'below'.
   */
  array(x, y, values, o = {}) {
    const w = o.w ?? 40;
    const h = o.h ?? 36;
    const tones = o.tones ?? {};
    const ghost = new Set(o.ghost ?? []);
    const strike = new Set(o.strike ?? []);
    values.forEach((v, i) => {
      const cx = x + i * w;
      const tone = typeof tones === 'function' ? tones(i, v) : tones[i];
      const g = ghost.has(i);
      this.rect(cx, y, w, h, { tone, rx: 0, ghost: g, sw: tone ? 1.6 : 1.3 });
      if (v !== null && v !== undefined && v !== '') {
        this.text(cx + w / 2, y + h / 2 + 0.5, v, { size: o.size ?? 15, mono: o.mono ?? true, bold: !!tone || o.bold, tone, ghost: g, muted: o.mutedValues?.includes?.(v) });
      }
      if (strike.has(i)) this.line(cx + 6, y + h - 6, cx + w - 6, y + 6, { tone: 'red', sw: 1.8 });
    });
    // re-stroke the outer frame so ghosted cells keep a clean border
    if (o.idx !== undefined && o.idx !== false) {
      const start = typeof o.idx === 'number' ? o.idx : 0;
      const iy = o.idxPos === 'above' ? y - 11 : y + h + 12;
      values.forEach((_, i) => this.text(x + i * w + w / 2, iy, o.idxLabels ? o.idxLabels[i] : start + i, { size: 11.5, muted: true, mono: true }));
    }
    return { cx: (i) => x + i * w + w / 2, x: (i) => x + i * w, y, w, h, right: x + values.length * w, bottom: y + h };
  }

  /** Linked-list node | data | next |. Returns anchors. */
  llnode(x, y, data, o = {}) {
    const dw = o.dw ?? 40;
    const pw = o.pw ?? 22;
    const h = o.h ?? 34;
    const tone = o.tone;
    this.rect(x, y, dw + pw, h, { tone, rx: 5, ghost: o.ghost, dash: o.dash });
    this.line(x + dw, y + 1, x + dw, y + h - 1, { tone, ghost: o.ghost, sw: 1.2 });
    if (data !== null && data !== undefined) this.text(x + dw / 2, y + h / 2 + 0.5, data, { size: o.size ?? 14, mono: o.mono ?? true, bold: true, tone, ghost: o.ghost });
    if (o.nil) {
      this.text(x + dw + pw / 2, y + h / 2 + 0.5, '∧', { size: 13, muted: true });
    } else {
      this.raw(`<circle cx="${n(x + dw + pw / 2)}" cy="${n(y + h / 2)}" r="2.6" class="${tone ? `solid-${tone}` : 'solid-gray'}${o.ghost ? ' ghost' : ''}"/>`);
    }
    return { x, y, w: dw + pw, h, left: x, right: x + dw + pw, cx: x + (dw + pw) / 2, cy: y + h / 2, dot: x + dw + pw / 2, top: y, bottom: y + h };
  }

  /**
   * Horizontal singly linked list. items: [{ v, tone, ghost, label }] or values.
   * Returns array of node anchors.
   */
  list(x, y, items, o = {}) {
    const gap = o.gap ?? 26;
    const dw = o.dw ?? 40;
    const pw = o.pw ?? 22;
    const nodes = [];
    items.forEach((it, i) => {
      const item = typeof it === 'object' && it !== null ? it : { v: it };
      const nx = x + i * (dw + pw + gap);
      const last = i === items.length - 1;
      const a = this.llnode(nx, y, item.v, { dw, pw, h: o.h, tone: item.tone, ghost: item.ghost, dash: item.dash, nil: last && o.nil !== false && !o.tail });
      nodes.push(a);
    });
    nodes.forEach((a, i) => {
      if (i === nodes.length - 1) return;
      const b = nodes[i + 1];
      const item = typeof items[i] === 'object' && items[i] !== null ? items[i] : {};
      this.line(a.dot, a.cy, b.left - 2, b.cy, { arrow: 'end', tone: item.linkTone, ghost: item.linkGhost, sw: 1.4 });
    });
    return nodes;
  }

  /**
   * Draws a binary/k-ary tree. spec = { id?, label, tone, children: [spec|null] }.
   * Layout: leaves get consecutive slots (null children reserve half a slot
   * so a lone child leans to its side). Returns { pos: Map(id -> {x,y}), nodes }.
   */
  tree(spec, o = {}) {
    const x0 = o.x ?? 0;
    const y0 = o.y ?? 30;
    const dx = o.dx ?? 46;
    const dy = o.dy ?? 62;
    const r = o.r ?? 18;
    let slot = 0;
    const all = [];
    let auto = 0;
    const place = (s, depth) => {
      if (!s) { slot += 0.5; return null; }
      const id = s.id ?? `n${auto++}`;
      const kids = s.children ?? [];
      const placed = [];
      if (kids.length === 0 || kids.every((k) => !k)) {
        if (kids.length) slot += 0; // ignore all-null children
        const nd = { ...s, id, x: x0 + slot * dx, y: y0 + depth * dy, kids: [] };
        slot += 1;
        all.push(nd);
        return nd;
      }
      for (const k of kids) placed.push(place(k, depth + 1));
      const real = placed.filter(Boolean);
      let x = (real[0].x + real[real.length - 1].x) / 2;
      if (real.length === 1 && kids.length === 2) {
        // a single child: put the parent diagonally above it
        x = placed[0] ? real[0].x + dx * 0.55 : real[0].x - dx * 0.55;
      }
      const nd = { ...s, id, x, y: y0 + depth * dy, kids: placed };
      all.push(nd);
      return nd;
    };
    const root = place(spec, 0);
    const pos = new Map(all.map((nd) => [nd.id, nd]));
    // edges first
    for (const nd of all) {
      nd.kids.forEach((k, i) => {
        if (!k) return;
        const ang = Math.atan2(k.y - nd.y, k.x - nd.x);
        const rr = nd.shape === 'dot' ? 6 : (nd.r ?? r);
        const kr = k.shape === 'dot' ? 6 : (k.r ?? r);
        const ex = { tone: k.edgeTone, ghost: k.ghost || k.edgeGhost, dash: k.edgeDash, sw: k.edgeTone ? 2.2 : 1.5 };
        this.line(nd.x + Math.cos(ang) * rr, nd.y + Math.sin(ang) * rr, k.x - Math.cos(ang) * kr, k.y - Math.sin(ang) * kr, ex);
        if (k.edgeLabel !== undefined) {
          const mx = (nd.x + k.x) / 2;
          const my = (nd.y + k.y) / 2;
          const off = (k.x < nd.x ? -1 : 1) * 11;
          this.text(mx + off, my - 4, k.edgeLabel, { size: 12.5, mono: true, bold: true, tone: k.edgeTone ?? 'gray' });
        }
      });
    }
    for (const nd of all) {
      if (nd.shape === 'box') {
        const bw = nd.bw ?? 44;
        this.rect(nd.x - bw / 2, nd.y - 15, bw, 30, { tone: nd.tone, rx: 5, ghost: nd.ghost });
        this.text(nd.x, nd.y + 0.5, nd.label, { bold: true, tone: nd.tone, mono: nd.mono ?? true, ghost: nd.ghost, size: nd.size ?? 14 });
      } else if (nd.shape === 'dot') {
        this.raw(`<circle cx="${n(nd.x)}" cy="${n(nd.y)}" r="${nd.tone ? 6.5 : 5}" class="${nd.tone ? `solid-${nd.tone}` : 'solid-gray'}"/>`);
      } else {
        this.node(nd.x, nd.y, nd.label, { r: nd.r ?? r, tone: nd.tone, ghost: nd.ghost, dash: nd.dash, size: nd.size, mono: nd.mono });
      }
      if (nd.note) this.text(nd.x + (nd.noteDx ?? 0), nd.y + (nd.noteDy ?? (r + 13)), nd.note, { size: 11.5, tone: nd.noteTone, subtle: !nd.noteTone, bold: !!nd.noteTone, mono: nd.noteMono });
    }
    return { pos, root, nodes: all };
  }

  /**
   * Graph with given node coordinates.
   * nodes: { id: { x, y, label?, tone?, ghost?, note? } }
   * edges: [{ u, v, w?, tone?, dir?, dash?, ghost?, bend?, at? (0..1), sw? }]
   */
  graph(nodes, edges, o = {}) {
    const r = o.r ?? 18;
    for (const e of edges) {
      const a = nodes[e.u];
      const b = nodes[e.v];
      const ra = a.r ?? r;
      const rb = b.r ?? r;
      const bend = e.bend ?? 0;
      const sw = e.sw ?? (e.tone ? 2.6 : 1.5);
      const lineOpt = { tone: e.tone, dash: e.dash, ghost: e.ghost, sw, arrow: e.dir || o.directed ? 'end' : undefined };
      let lx;
      let ly;
      if (!bend) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const x1 = a.x + Math.cos(ang) * ra;
        const y1 = a.y + Math.sin(ang) * ra;
        const pad = lineOpt.arrow ? 2 : 0;
        const x2 = b.x - Math.cos(ang) * (rb + pad);
        const y2 = b.y - Math.sin(ang) * (rb + pad);
        this.line(x1, y1, x2, y2, lineOpt);
        const t = e.at ?? 0.5;
        lx = x1 + (x2 - x1) * t;
        ly = y1 + (y2 - y1) * t;
      } else {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const cx = mx + (-dy / len) * bend;
        const cy = my + (dx / len) * bend;
        const a1 = Math.atan2(cy - a.y, cx - a.x);
        const a2 = Math.atan2(cy - b.y, cx - b.x);
        const x1 = a.x + Math.cos(a1) * ra;
        const y1 = a.y + Math.sin(a1) * ra;
        const pad = lineOpt.arrow ? 2 : 0;
        const x2 = b.x + Math.cos(a2) * (rb + pad);
        const y2 = b.y + Math.sin(a2) * (rb + pad);
        this.path(`M${n(x1)} ${n(y1)}Q${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}`, lineOpt);
        lx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
        ly = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
      }
      if (e.w !== undefined && e.w !== null && e.w !== '') {
        const label = String(e.w);
        const size = e.size ?? 12.5;
        const w = Math.max(18, textWidth(label, size, true) + 10);
        const ox = e.lx ?? 0;
        const oy = e.ly ?? 0;
        this.raw(`<rect x="${n(lx + ox - w / 2)}" y="${n(ly + oy - 9)}" width="${n(w)}" height="18" rx="9" class="surface${e.ghost ? ' ghost' : ''}" ${e.tone ? `stroke="var(--${e.tone})" stroke-width="1"` : 'stroke="var(--faint)" stroke-width="0.8"'}/>`);
        this.text(lx + ox, ly + oy + 0.5, label, { size, mono: true, bold: true, tone: e.tone, ghost: e.ghost });
      }
    }
    for (const [id, nd] of Object.entries(nodes)) {
      if (nd.hidden) continue;
      this.node(nd.x, nd.y, nd.label ?? id, { r: nd.r ?? r, tone: nd.tone, ghost: nd.ghost, dash: nd.dash, size: nd.size });
      if (nd.note) this.text(nd.x + (nd.ndx ?? 0), nd.y + (nd.ndy ?? -(nd.r ?? r) - 11), nd.note, { size: nd.noteSize ?? 11.5, mono: true, bold: true, tone: nd.noteTone, subtle: !nd.noteTone });
    }
    return this;
  }

  /**
   * Simple grid table. rows: array of arrays (strings). o.colW: number|array,
   * o.rowH, o.head (first row is header), o.tone(r, c) -> tone for a cell.
   */
  table(x, y, rows, o = {}) {
    const rowH = o.rowH ?? 30;
    const colW = Array.isArray(o.colW) ? o.colW : rows[0].map(() => o.colW ?? 60);
    const totalW = colW.reduce((a, b) => a + b, 0);
    const xs = [x];
    for (const c of colW) xs.push(xs[xs.length - 1] + c);
    rows.forEach((row, r) => {
      const ry = y + r * rowH;
      if (o.head !== false && r === 0) this.rect(x, ry, totalW, rowH, { panel: true, rx: 0, sw: 0.8 });
      row.forEach((cell, c) => {
        const tone = o.tone?.(r, c, cell);
        if (tone) this.rect(xs[c] + 1, ry + 1, colW[c] - 2, rowH - 2, { tone, rx: 3, sw: 0 , fill: true});
        const head = o.head !== false && (r === 0 || (o.headCol && c === 0));
        const align = o.align?.[c] ?? 'middle';
        const tx = align === 'start' ? xs[c] + 8 : xs[c] + colW[c] / 2;
        this.text(tx, ry + rowH / 2 + 0.5, cell, { anchor: align, size: o.size ?? 13, bold: head || !!tone, subtle: head && !tone, tone, mono: o.mono && !head });
      });
    });
    // grid lines
    const totalH = rows.length * rowH;
    for (let r = 0; r <= rows.length; r += 1) this.line(x, y + r * rowH, x + totalW, y + r * rowH, { cls: 'faint', sw: r === 0 || r === rows.length || (r === 1 && o.head !== false) ? 1.2 : 0.8 });
    if (o.vlines !== false) xs.forEach((cx) => this.line(cx, y, cx, y + totalH, { cls: 'faint', sw: 0.8 }));
    return { xs, colW, rowH, bottom: y + totalH, right: x + totalW, cy: (r) => y + r * rowH + rowH / 2, cx: (c) => xs[c] + colW[c] / 2 };
  }

  /** Legend row: items [{ tone, label, kind: 'box'|'line'|'dash' }]. */
  legend(x, y, items, o = {}) {
    let cx = x;
    for (const it of items) {
      if (it.kind === 'line' || it.kind === 'dash') {
        this.line(cx, y, cx + 22, y, { tone: it.tone, sw: 2.6, dash: it.kind === 'dash' });
        cx += 28;
      } else if (it.kind === 'ghost') {
        this.rect(cx, y - 7, 14, 14, { rx: 3, ghost: true });
        cx += 20;
      } else {
        this.rect(cx, y - 7, 14, 14, { tone: it.tone, rx: 3, sw: 1.3 });
        cx += 20;
      }
      this.text(cx, y + 0.5, it.label, { anchor: 'start', size: o.size ?? 12.5, subtle: true });
      cx += textWidth(it.label, o.size ?? 12.5) + (o.gap ?? 20);
    }
    return this;
  }

  /* ---------- output ---------- */

  svg(palette) {
    const defs = [...this.markers].map((id) => `<marker id="${id}" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="7.5" markerHeight="7.5" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0.6 0.8L9.4 5L0.6 9.2L2.6 5z" class="${id}"/></marker>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}" role="img"><style>${paletteVars(palette)}${BASE_CSS}</style><defs>${defs}</defs>${this.parts.join('')}</svg>\n`;
  }

  save(name) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `${name}.svg`), this.svg(LIGHT));
    writeFileSync(join(OUT_DIR, `${name}-dark.svg`), this.svg(DARK));
    MANIFEST.push({ name, w: this.w, h: this.h });
    return this;
  }
}

export const MANIFEST = [];

/** Rough text width: CJK glyphs ~1em, Latin ~0.58em, digits mono ~0.6em. */
export function textWidth(s, size = 14, mono = false) {
  let w = 0;
  const str = String(s).replace(/_\{([^}]*)\}|_(.)|\^\{([^}]*)\}/g, (m, a, b, c) => ' '.repeat(Math.ceil(((a ?? b ?? c) ?? '').length * 0.7)));
  for (const ch of str.replace(/\*/g, '')) {
    const code = ch.codePointAt(0);
    if (code > 0x2e80) w += 1;
    else if (mono) w += 0.62;
    else if ('il.,:;|!\'`'.includes(ch)) w += 0.3;
    else if ('mwMW'.includes(ch)) w += 0.85;
    else if (ch === ' ') w += 0.32;
    else w += 0.68;
  }
  return w * size;
}

export function snippet(name, alt, caption) {
  const m = MANIFEST.find((x) => x.name === name);
  return `<AlgoFigure src="${URL_BASE}/${name}" w={${m.w}} h={${m.h}} alt="${alt}"${caption ? ` caption="${caption}"` : ''} />`;
}
