// 第 5 章 图：真题解析配图。
import { Fig } from './lib.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- 2009-41 最近邻贪心的两个反例 ---------- */
{
  const f = new Fig(740, 316);
  f.panel(10, 8, 410, 300, '反例 ①：贪心路径比最短路长');
  const N = { 1: { x: 70, y: 200 }, 2: { x: 150, y: 90 }, 3: { x: 290, y: 90 }, 4: { x: 370, y: 200 } };
  N[1].tone = 'blue'; N[4].tone = 'blue';
  N[1].note = '起点'; N[4].note = '终点'; N[1].ndy = 34; N[4].ndy = 34;
  f.graph(N, [
    { u: 1, v: 2, w: '1', tone: 'red', dir: true },
    { u: 2, v: 3, w: '1', tone: 'red', dir: true },
    { u: 3, v: 4, w: '1', tone: 'red', dir: true },
    { u: 1, v: 4, w: '2', tone: 'green', dash: true, ly: 0 },
  ], { r: 20 });
  f.text(215, 266, '贪心：1→2→3→4，长度 3', { size: 12.5, tone: 'red', bold: true });
  f.text(215, 290, '最短：1→4，长度 2', { size: 12.5, tone: 'green', bold: true });
  f.chip(220, 152, '在点 1：边 1 < 边 2，先去点 2', { tone: 'red', size: 11 });

  f.panel(430, 8, 300, 300, '反例 ②：贪心甚至走不到终点');
  const M = { 1: { x: 520, y: 150, tone: 'blue', note: '起点', ndy: 34 }, 2: { x: 650, y: 80 }, 3: { x: 650, y: 210, tone: 'blue', note: '终点', ndy: 32 } };
  f.graph(M, [
    { u: 1, v: 2, w: '1', tone: 'red', dir: true },
    { u: 1, v: 3, w: '2', dash: true },
  ], { r: 20 });
  f.text(690, 56, '死胡同', { size: 12, tone: 'red', bold: true });
  f.text(580, 268, '到 2 后唯一邻点 1 已在路径中', { size: 12, subtle: true });
  f.text(580, 290, '无法继续 ⇒ 找不到路径', { size: 12.5, tone: 'red', bold: true });
  f.save('2009-41-1');
}

/* ---------- 2011-41 压缩存储还原 + 关键路径 ---------- */
{
  const f = new Fig(740, 346);
  const vals = ['4', '6', '∞', '∞', '∞', '5', '∞', '∞', '∞', '4', '3', '∞', '∞', '3', '3'];
  const rowOf = [0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4];
  const tones = ['blue', 'amber', 'green', 'violet', 'teal'];
  f.text(20, 26, '一维数组（行优先存储严格上三角，共 6×5/2 = 15 个元素）', { anchor: 'start', size: 13, bold: true, subtle: true });
  const a = f.array(20, 44, vals, { w: 46, h: 32, tones: (i) => tones[rowOf[i]], idx: true, size: 13 });
  [[0, 4, '第 0 行'], [5, 8, '第 1 行'], [9, 11, '第 2 行'], [12, 13, '第 3 行'], [14, 14, '第 4 行']].forEach(([lo, hi, s], k) => f.brace(a.x(lo) + 3, a.x(hi) + 43, 100, s, { tone: tones[k], size: 11.5 }));
  // matrix
  const M = [
    ['0', '4', '6', '∞', '∞', '∞'],
    ['∞', '0', '5', '∞', '∞', '∞'],
    ['∞', '∞', '0', '4', '3', '∞'],
    ['∞', '∞', '∞', '0', '∞', '3'],
    ['∞', '∞', '∞', '∞', '0', '3'],
    ['∞', '∞', '∞', '∞', '∞', '0'],
  ];
  const mx = 70, my = 150, cw = 40, ch = 26;
  for (let i = 0; i < 6; i += 1) {
    f.text(mx - 16, my + i * ch + ch / 2, String(i), { size: 11.5, muted: true, mono: true });
    f.text(mx + i * cw + cw / 2, my - 10, String(i), { size: 11.5, muted: true, mono: true });
    for (let j = 0; j < 6; j += 1) {
      const up = j > i;
      const tone = up ? tones[i] : undefined;
      if (up) f.rect(mx + j * cw + 1, my + i * ch + 1, cw - 2, ch - 2, { tone, rx: 3, sw: M[i][j] === '∞' ? 0.6 : 1.4 });
      f.text(mx + j * cw + cw / 2, my + i * ch + ch / 2, M[i][j], { mono: true, size: 13, bold: up && M[i][j] !== '∞', tone: up && M[i][j] !== '∞' ? tone : undefined, muted: !up || M[i][j] === '∞' });
    }
  }
  f.path(`M${mx - 4} ${my - 2}L${mx - 8} ${my - 2}L${mx - 8} ${my + 6 * ch + 2}L${mx - 4} ${my + 6 * ch + 2}`, { sw: 1.4 });
  f.path(`M${mx + 6 * cw + 4} ${my - 2}L${mx + 6 * cw + 8} ${my - 2}L${mx + 6 * cw + 8} ${my + 6 * ch + 2}L${mx + 6 * cw + 4} ${my + 6 * ch + 2}`, { sw: 1.4 });
  f.text(mx + 3 * cw, my + 6 * ch + 20, '邻接矩阵 A（下三角与对角线不存储）', { size: 12, subtle: true });
  f.panel(400, 140, 330, 182, '下标换算（i < j，均从 0 起）');
  f.text(416, 182, 'k = 第 i 行之前的元素数 + 行内偏移', { anchor: 'start', size: 12.5 });
  f.text(416, 210, '  = i(11 − i)/2 + (j − i − 1)', { anchor: 'start', size: 13, mono: true, bold: true, tone: 'violet' });
  f.text(416, 244, '例：(2, 4) → 9 + 1 = 10，值为 3', { anchor: 'start', size: 12.5 });
  f.text(416, 272, '有向图：左下三角不照抄右上三角', { anchor: 'start', size: 12, subtle: true });
  f.text(416, 296, '∞ 表示无弧，不是持续时间 0', { anchor: 'start', size: 12, subtle: true });
  f.save('2011-41-1');
}
{
  const f = new Fig(740, 330);
  const N = {
    0: { x: 70, y: 170 }, 1: { x: 220, y: 70 }, 2: { x: 340, y: 170 },
    3: { x: 500, y: 80 }, 4: { x: 500, y: 260 }, 5: { x: 660, y: 170 },
  };
  const ve = [0, 4, 9, 13, 12, 16], vl = [0, 4, 9, 13, 13, 16];
  for (const k of Object.keys(N)) {
    const crit = ve[k] === vl[k];
    N[k].tone = crit ? 'green' : 'gray';
    N[k].r = 22;
  }
  f.graph(N, [
    { u: 0, v: 1, w: '4', tone: 'green', dir: true },
    { u: 0, v: 2, w: '6 · 差3', dir: true, dash: true },
    { u: 1, v: 2, w: '5', tone: 'green', dir: true },
    { u: 2, v: 3, w: '4', tone: 'green', dir: true },
    { u: 2, v: 4, w: '3 · 差1', dir: true, dash: true },
    { u: 3, v: 5, w: '3', tone: 'green', dir: true },
    { u: 4, v: 5, w: '3 · 差1', dir: true, dash: true },
  ], { r: 22 });
  const tag = (k, dx, dy) => {
    const n = N[k];
    f.chip(n.x + dx, n.y + dy, `ve ${ve[k]} / vl ${vl[k]}`, { tone: ve[k] === vl[k] ? 'green' : 'amber', size: 11, mono: true });
  };
  tag(0, 0, -40); tag(1, 0, -38); tag(2, 0, 42); tag(3, 0, -38); tag(4, 0, 40); tag(5, 0, -40);
  f.legend(70, 314, [{ kind: 'line', tone: 'green', label: '关键活动（时差 0）：0→1→2→3→5，长度 16' }, { kind: 'dash', label: '非关键活动（标注总时差）' }]);
  f.save('2011-41-2');
}

/* ---------- 2014-42 OSPF：邻接表 + Dijkstra ---------- */
{
  const f = new Fig(740, 290);
  f.text(20, 24, '邻接表：每个路由器一个顶点结点，出边链表记录「对端 · 费用」', { anchor: 'start', size: 13, bold: true, subtle: true });
  const rows = [
    ['R1', [['R2', 3], ['R3', 2], ['192.1.1.0/24', 1]]],
    ['R2', [['R1', 3], ['R4', 4], ['192.1.6.0/24', 1]]],
    ['R3', [['R1', 2], ['R4', 6], ['192.1.5.0/24', 1]]],
    ['R4', [['R2', 4], ['R3', 6], ['192.1.7.0/24', 1]]],
  ];
  rows.forEach(([v, es], i) => {
    const y = 50 + i * 56;
    f.rect(20, y, 60, 36, { tone: 'blue', rx: 0 });
    f.text(42, y + 18, v, { bold: true, tone: 'blue', mono: true });
    f.line(64, y + 2, 64, y + 34, { tone: 'blue', sw: 1 });
    f.raw(`<circle cx="72" cy="${y + 18}" r="2.6" class="solid-blue"/>`);
    let x = 120;
    let prev = 72;
    es.forEach(([to, m], j) => {
      const sub = to.includes('/');
      const w1 = sub ? 116 : 46;
      f.line(prev, y + 18, x - 2, y + 18, { arrow: 'end', sw: 1.3 });
      f.rect(x, y + 2, w1 + 34 + 20, 32, { tone: sub ? 'teal' : undefined, rx: 5 });
      f.text(x + w1 / 2, y + 18, to, { size: sub ? 11.5 : 13, mono: true, bold: true, tone: sub ? 'teal' : undefined });
      f.line(x + w1, y + 4, x + w1, y + 32, { sw: 1, tone: sub ? 'teal' : undefined });
      f.text(x + w1 + 17, y + 18, String(m), { mono: true, bold: true, tone: 'amber', size: 13 });
      f.line(x + w1 + 34, y + 4, x + w1 + 34, y + 32, { sw: 1, tone: sub ? 'teal' : undefined });
      if (j === es.length - 1) f.text(x + w1 + 44, y + 18, '∧', { size: 12, muted: true });
      else f.raw(`<circle cx="${x + w1 + 44}" cy="${y + 18}" r="2.6" class="solid-gray"/>`);
      prev = x + w1 + 44;
      x += w1 + 54 + 26;
    });
  });
  f.legend(120, 280, [{ tone: 'blue', label: '顶点表（路由器）' }, { tone: 'amber', label: '边结点：对端 | 费用 | next' }, { tone: 'teal', label: '直连子网' }]);
  f.save('2014-42-1');
}
{
  const f = new Fig(740, 470);
  const base = { R1: { x: 0, y: 0 }, R2: { x: 150, y: 0 }, R3: { x: 0, y: 110 }, R4: { x: 150, y: 110 } };
  const E = [['R1', 'R2', 3], ['R1', 'R3', 2], ['R2', 'R4', 4], ['R3', 'R4', 6]];
  const steps = [
    { t: '① 初始化', dist: { R1: '0', R2: '∞', R3: '∞', R4: '∞' }, done: [], tree: [] },
    { t: '② 确定 R1，松弛', dist: { R1: '0', R2: '3', R3: '2', R4: '∞' }, done: ['R1'], tree: [['R1', 'R2'], ['R1', 'R3']], cur: 'R1' },
    { t: '③ 确定 R3（2），松弛', dist: { R1: '0', R2: '3', R3: '2', R4: '8' }, done: ['R1', 'R3'], tree: [['R1', 'R2'], ['R1', 'R3'], ['R3', 'R4']], cur: 'R3' },
    { t: '④ 确定 R2（3），R4: 8→7', dist: { R1: '0', R2: '3', R3: '2', R4: '7' }, done: ['R1', 'R3', 'R2'], tree: [['R1', 'R2'], ['R1', 'R3'], ['R2', 'R4']], cur: 'R2', upd: 'R4' },
  ];
  steps.forEach((s, k) => {
    const ox = 20 + (k % 2) * 360, oy = 10 + Math.floor(k / 2) * 228;
    f.panel(ox, oy, 350, 216, s.t);
    const N = {};
    for (const [id, p] of Object.entries(base)) {
      const done = s.done.includes(id);
      N[id] = { x: ox + 100 + p.x, y: oy + 64 + p.y, r: 20, tone: id === s.cur ? 'blue' : done ? 'green' : undefined, label: id, size: 12.5 };
      const d = s.dist[id];
      N[id].note = `d=${d}`;
      N[id].noteTone = id === s.upd ? 'red' : done || id === s.cur ? 'green' : undefined;
      N[id].ndx = p.x === 0 ? -46 : 46;
      N[id].ndy = 0;
      N[id].noteSize = 12;
    }
    const inTree = (u, v) => s.tree.some(([a, b]) => (a === u && b === v) || (a === v && b === u));
    f.graph(N, E.map(([u, v, w]) => ({ u, v, w: String(w), tone: inTree(u, v) ? 'green' : undefined, sw: inTree(u, v) ? 2.4 : 1.4, dash: s.upd && u === 'R3' && v === 'R4' })), { r: 20 });
  });
  f.text(370, 462, '前驱链：R4 ← R2 ← R1；到子网再加末段 1：192.1.7.0/24 的费用为 7 + 1 = 8', { size: 12.5, bold: true, tone: 'violet' });
  f.save('2014-42-2');
}

/* ---------- 2015-42 A² 的含义 ---------- */
{
  const f = new Fig(740, 310);
  f.panel(10, 8, 330, 294, '两步游走 0 → k → 3');
  const N = { 0: { x: 170, y: 64 }, 1: { x: 290, y: 120 }, 2: { x: 60, y: 140 }, 3: { x: 170, y: 250 }, 4: { x: 260, y: 230 } };
  N[0].tone = 'blue'; N[3].tone = 'blue';
  f.graph(N, [
    { u: 0, v: 1, tone: 'red', sw: 2.4 }, { u: 1, v: 3, tone: 'red', sw: 2.4 },
    { u: 0, v: 2, tone: 'amber', sw: 2.4 }, { u: 2, v: 3, tone: 'amber', sw: 2.4 },
    { u: 0, v: 4, tone: 'green', sw: 2.4 }, { u: 4, v: 3, tone: 'green', sw: 2.4 },
    { u: 1, v: 4, dash: true },
  ], { r: 19 });
  f.text(175, 290, '0→1→3、0→2→3、0→4→3，共 3 条', { size: 12, bold: true, subtle: true });

  f.panel(350, 8, 380, 294, '(A²)₀₃ = 第 0 行 · 第 3 列');
  const row0 = [0, 1, 1, 0, 1], col3 = [0, 1, 1, 0, 1];
  const tones = [undefined, 'red', 'amber', undefined, 'green'];
  const cx0 = 470, W = 40;
  f.text(cx0 - 20, 70, 'k', { size: 12, italic: true, muted: true });
  ['A[0][k]', 'A[k][3]', '乘积'].forEach((s, i) => f.text(cx0 - 52, 104 + i * 50, s, { size: 12, mono: true, subtle: true, anchor: 'middle' }));
  row0.forEach((v, k) => {
    const x = cx0 + k * W;
    f.text(x + W / 2, 70, String(k), { size: 12, mono: true, muted: true });
    f.rect(x, 88, W, 32, { tone: v ? tones[k] : undefined, rx: 0 });
    f.text(x + W / 2, 104, String(v), { mono: true, bold: !!v, tone: v ? tones[k] : undefined });
    f.rect(x, 138, W, 32, { tone: col3[k] ? tones[k] : undefined, rx: 0 });
    f.text(x + W / 2, 154, String(col3[k]), { mono: true, bold: !!col3[k], tone: col3[k] ? tones[k] : undefined });
    const p = v * col3[k];
    f.text(x + W / 2, 204, String(p), { mono: true, size: 16, bold: true, tone: p ? tones[k] : undefined, muted: !p });
  });
  f.line(cx0, 182, cx0 + 5 * W, 182, { sw: 1.2 });
  f.text(cx0 + 2.5 * W, 244, '求和 = 0 + 1 + 1 + 0 + 1 = 3', { size: 14, bold: true, tone: 'violet' });
  f.text(cx0 + 2.5 * W, 274, '乘积为 1 ⇔ 存在 0–k 与 k–3 两条边', { size: 12, subtle: true });
  f.save('2015-42-1');
}

/* ---------- 2017-42 Prim ---------- */
const P17 = { A: { x: 110, y: 30 }, B: { x: 30, y: 90 }, E: { x: 190, y: 90 }, C: { x: 55, y: 175 }, D: { x: 165, y: 175 } };
const E17 = [['A', 'B', 6], ['A', 'E', 5], ['A', 'D', 4], ['B', 'C', 4], ['C', 'E', 5], ['C', 'D', 6], ['D', 'E', 4]];
{
  const f = new Fig(740, 518);
  const steps = [
    { S: ['A'], tree: [], pick: ['A', 'D'], t: '① S={A}，选 AD(4)' },
    { S: ['A', 'D'], tree: [['A', 'D']], pick: ['D', 'E'], t: '② S={A,D}，选 DE(4)' },
    { S: ['A', 'D', 'E'], tree: [['A', 'D'], ['D', 'E']], pick: ['E', 'C'], t: '③ S={A,D,E}，选 EC(5)' },
    { S: ['A', 'D', 'E', 'C'], tree: [['A', 'D'], ['D', 'E'], ['E', 'C']], pick: ['C', 'B'], t: '④ S={A,C,D,E}，选 CB(4)' },
  ];
  const same = (e, u, v) => (e[0] === u && e[1] === v) || (e[0] === v && e[1] === u);
  steps.forEach((s, k) => {
    const ox = 10 + (k % 3) * 245, oy = 8 + Math.floor(k / 3) * 246;
    f.panel(ox, oy, 235, 236, s.t, { titleSize: 12.5 });
    const N = {};
    for (const [id, p] of Object.entries(P17)) N[id] = { x: ox + 10 + p.x, y: oy + 34 + p.y, tone: s.S.includes(id) ? 'green' : undefined };
    const edges = E17.map(([u, v, w]) => {
      const inT = s.tree.some((e) => same(e, u, v));
      const pick = same(s.pick, u, v);
      const cross = s.S.includes(u) !== s.S.includes(v);
      return { u, v, w: String(w), tone: pick ? 'red' : inT ? 'green' : cross ? 'amber' : undefined, dash: cross && !pick, ghost: !inT && !pick && !cross, sw: pick ? 3 : inT ? 2.6 : 1.5 };
    });
    f.graph(N, edges, { r: 16 });
  });
  // final + uniqueness
  const ox = 255, oy = 254;
  f.panel(ox, oy, 475, 236, '⑤ MST = {AD, DE, EC, CB}，总权 17；检验唯一性', { titleSize: 12.5 });
  const N = {};
  for (const [id, p] of Object.entries(P17)) N[id] = { x: ox + 14 + p.x, y: oy + 34 + p.y, tone: 'green' };
  const tree = [['A', 'D'], ['D', 'E'], ['E', 'C'], ['C', 'B']];
  f.graph(N, E17.map(([u, v, w]) => ({ u, v, w: String(w), tone: tree.some((e) => same(e, u, v)) ? 'green' : 'gray', dash: !tree.some((e) => same(e, u, v)), sw: tree.some((e) => same(e, u, v)) ? 2.6 : 1.4 })), { r: 16 });
  const rows = [
    ['非树边', '树上路径', '路径最大边', '比较'],
    ['AB = 6', 'A–D–E–C–B', '5', '6 > 5'],
    ['AE = 5', 'A–D–E', '4', '5 > 4'],
    ['CD = 6', 'C–E–D', '5', '6 > 5'],
  ];
  f.table(ox + 226, oy + 52, rows, { colW: [64, 86, 48, 46], rowH: 30, size: 12, tone: (r, c) => (r > 0 && c === 3 ? 'green' : undefined) });
  f.text(ox + 348, oy + 200, '每条非树边都严格大于路径最大边', { size: 12, subtle: true });
  f.text(ox + 348, oy + 220, '⇒ 无法等权替换，MST 唯一', { size: 12.5, bold: true, tone: 'green' });
  f.legend(20, 506, [{ tone: 'green', label: '已入树' }, { kind: 'dash', tone: 'amber', label: '跨 S 的候选边' }, { kind: 'line', tone: 'red', label: '本轮最轻跨界边' }], { size: 12 });
  f.save('2017-42-1');
}

/* ---------- 2018-42 Kruskal + TTL ---------- */
const P18 = { XA: { x: 0, y: 0 }, BJ: { x: 150, y: 0 }, TL: { x: 300, y: 0 }, WH: { x: 0, y: 105 }, JN: { x: 300, y: 105 }, CS: { x: 0, y: 210 }, QD: { x: 150, y: 210 }, NJ: { x: 300, y: 210 } };
const E18 = [['XA', 'BJ', 2], ['BJ', 'TL', 3], ['XA', 'WH', 2], ['BJ', 'WH', 3], ['BJ', 'JN', 4], ['TL', 'JN', 2], ['WH', 'CS', 4], ['WH', 'QD', 3], ['JN', 'QD', 2], ['JN', 'NJ', 3], ['CS', 'QD', 3], ['QD', 'NJ', 2]];
const same = (e, u, v) => (e[0] === u && e[1] === v) || (e[0] === v && e[1] === u);
{
  const f = new Fig(740, 346);
  f.panel(10, 8, 720, 330, 'Kruskal：先选全部 5 条费用 2 的边，剩下 3 个连通分量，再用费用 3 的边连接');
  const ox = 70, oy = 76;
  // component hulls
  f.rect(ox - 30, oy - 26, 210, 157, { tone: 'blue', fill: false, dash: true, rx: 20, sw: 1.2 });
  f.path(`M${ox + 266} ${oy - 28}H${ox + 336}V${oy + 240}H${ox + 116}V${oy + 176}H${ox + 266}Z`, { tone: 'violet', dash: true, sw: 1.2 });
  const N = {};
  for (const [id, p] of Object.entries(P18)) N[id] = { x: ox + p.x, y: oy + p.y, r: 22, label: id, size: 12 };
  ['XA', 'BJ', 'WH'].forEach((k) => (N[k].tone = 'blue'));
  ['TL', 'JN', 'QD', 'NJ'].forEach((k) => (N[k].tone = 'violet'));
  N.CS.tone = 'amber';
  const e = E18.map(([u, v, w]) => {
    let o = { u, v, w: String(w), ghost: true };
    if (w === 2) o = { u, v, w: '2', tone: 'green', sw: 2.6 };
    if (same(['CS', 'QD'], u, v)) o = { u, v, w: '3 必选', tone: 'red', sw: 2.6 };
    if (same(['WH', 'QD'], u, v) || same(['BJ', 'TL'], u, v)) o = { u, v, w: '3 二选一', tone: 'amber', dash: true, sw: 2.4 };
    if (same(['BJ', 'WH'], u, v) || same(['JN', 'NJ'], u, v)) o = { u, v, w: '3 成环', ghost: true, dash: true };
    return o;
  });
  // TL-JN/JN-NJ/QD-NJ hull: TL, JN, QD, NJ are not a rectangle; draw custom hull instead of the second rect
  f.graph(N, e, { r: 22 });
  f.text(560, 80, '分量：', { anchor: 'start', size: 12.5, bold: true });
  f.chip(600, 106, '{XA, BJ, WH}', { tone: 'blue', size: 11.5 });
  f.chip(612, 136, '{TL, JN, QD, NJ}', { tone: 'violet', size: 11.5 });
  f.chip(588, 166, '{CS}', { tone: 'amber', size: 11.5 });
  f.text(470, 210, 'CS 只能经 CS–QD(3) 接入：必选', { anchor: 'start', size: 12, tone: 'red' });
  f.text(470, 234, '连两大分量：WH–QD 或 BJ–TL，二选一', { anchor: 'start', size: 12, tone: 'amber' });
  f.text(470, 258, 'BJ–WH、JN–NJ 会成环，舍弃', { anchor: 'start', size: 12, subtle: true });
  f.text(470, 290, '总费用 5×2 + 3 + 3 = 16', { anchor: 'start', size: 14, bold: true, tone: 'green' });
  f.save('2018-42-1');
}
{
  const f = new Fig(740, 360);
  const base = E18.filter(([u, v, w]) => w === 2 || same(['CS', 'QD'], u, v));
  const plans = [
    { t: '方案甲：+ WH–QD', extra: ['WH', 'QD'], path: ['TL', 'JN', 'QD', 'WH', 'XA', 'BJ'], ok: false },
    { t: '方案乙：+ BJ–TL', extra: ['BJ', 'TL'], path: ['TL', 'BJ'], ok: true },
  ];
  plans.forEach((pl, k) => {
    const ox = 10 + k * 365;
    f.panel(ox, 8, 355, 344, pl.t);
    const N = {};
    for (const [id, p] of Object.entries(P18)) N[id] = { x: ox + 60 + p.x * 0.8, y: 64 + p.y * 0.9, r: 20, label: id, size: 11.5 };
    const onPath = (u, v) => pl.path.some((x, i) => i < pl.path.length - 1 && same([x, pl.path[i + 1]], u, v));
    const edges = [...base, [...pl.extra, 3]].map(([u, v, w]) => ({ u, v, w: String(w), tone: onPath(u, v) ? (pl.ok ? 'green' : 'red') : undefined, sw: onPath(u, v) ? 3 : 1.6 }));
    pl.path.forEach((id, i) => {
      N[id].tone = pl.ok ? 'green' : 'red';
      if (i < pl.path.length - 1) {
        const ttl = 5 - (i + 1);
        N[id].note = `TTL→${ttl}`;
        N[id].noteTone = ttl === 0 ? 'red' : pl.ok ? 'green' : 'amber';
        N[id].ndy = -32;
      } else if (pl.ok) {
        N[id].note = 'TTL→3 交付';
        N[id].noteTone = 'green';
        N[id].ndy = -32;
      }
    });
    f.graph(N, edges, { r: 20 });
    f.text(ox + 178, 296, pl.ok ? 'TL 转发后 TTL=4，BJ 转发给 H2 后仍为正' : 'TL→JN→QD→WH→XA 各减 1，到 XA 减为 0', { size: 12, subtle: true });
    f.text(ox + 178, 322, pl.ok ? 'H2 能收到 ✓' : '在 XA 被丢弃，H2 收不到 ✗', { size: 13.5, bold: true, tone: pl.ok ? 'green' : 'red' });
  });
  f.save('2018-42-2');
}

/* ---------- 2021-41 奇度顶点数 ---------- */
{
  const f = new Fig(740, 322);
  const cases = [
    { t: '三角形', N: { a: [70, 70], b: [20, 160], c: [120, 160] }, E: [['a', 'b'], ['b', 'c'], ['c', 'a']], verdict: '奇度 0 个 ✓ 欧拉回路', ok: true },
    { t: '链', N: { a: [20, 110], b: [70, 110], c: [120, 110] }, E: [['a', 'b'], ['b', 'c']], verdict: '奇度 2 个 ✓ 端点到端点', ok: true },
    { t: '星形 K₁,₃', N: { o: [70, 115], a: [70, 50], b: [15, 160], c: [125, 160] }, E: [['o', 'a'], ['o', 'b'], ['o', 'c']], verdict: '奇度 4 个 ✗', ok: false },
    { t: '不连通（题设排除）', N: { a: [28, 70], b: [6, 150], c: [50, 150], d: [112, 70], e: [90, 150], g: [134, 150] }, E: [['a', 'b'], ['b', 'c'], ['c', 'a'], ['d', 'e'], ['e', 'g'], ['g', 'd']], verdict: '奇度 0 个，但走不完', ok: null },
  ];
  cases.forEach((c, k) => {
    const ox = 10 + k * 182;
    f.panel(ox, 8, 172, 284, c.t);
    const deg = {};
    for (const [u, v] of c.E) { deg[u] = (deg[u] ?? 0) + 1; deg[v] = (deg[v] ?? 0) + 1; }
    const N = {};
    for (const [id, [x, y]] of Object.entries(c.N)) N[id] = { x: ox + 16 + x, y: 20 + y, r: 15, label: String(deg[id]), tone: deg[id] % 2 ? 'red' : 'green', size: 13 };
    f.graph(N, c.E.map(([u, v]) => ({ u, v })), { r: 15 });
    f.text(ox + 86, 232, c.verdict, { size: 12, bold: true, tone: c.ok === true ? 'green' : c.ok === false ? 'red' : 'amber' });
    if (c.ok === null) f.text(ox + 86, 256, '所以「连通」是关键前提', { size: 11.5, subtle: true });
  });
  f.legend(20, 310, [{ tone: 'green', label: '偶度顶点（圈内数字为度）' }, { tone: 'red', label: '奇度顶点' }]);
  f.save('2021-41-1');
}

/* ---------- 2023-41 出度、入度：行与列 ---------- */
{
  const f = new Fig(740, 300);
  f.panel(10, 8, 300, 284, '有向图');
  const N = { a: { x: 160, y: 60 }, b: { x: 70, y: 140 }, c: { x: 160, y: 230 }, d: { x: 250, y: 140 } };
  const out = { a: 2, b: 2, c: 1, d: 0 }, inn = { a: 0, b: 1, c: 1, d: 3 };
  for (const k of Object.keys(N)) {
    N[k].tone = out[k] > inn[k] ? 'green' : undefined;
    N[k].note = `出${out[k]} 入${inn[k]}`;
    N[k].noteTone = out[k] > inn[k] ? 'green' : undefined;
    N[k].ndy = k === 'c' ? 0 : k === 'a' ? -32 : 34;
    if (k === 'c') N[k].ndx = 58;
  }
  f.graph(N, [{ u: 'a', v: 'b' }, { u: 'a', v: 'd' }, { u: 'b', v: 'd' }, { u: 'b', v: 'c' }, { u: 'c', v: 'd' }], { r: 20, directed: true });
  f.text(160, 278, '绿色：出度 > 入度（K 顶点）', { size: 12, tone: 'green', bold: true });

  f.panel(320, 8, 410, 284, '以 b 为例：第 b 行数出度，第 b 列数入度');
  const V = ['a', 'b', 'c', 'd'];
  const A = [[0, 1, 0, 1], [0, 0, 1, 1], [0, 0, 0, 1], [0, 0, 0, 0]];
  const mx = 400, my = 74, cw = 46, ch = 36;
  V.forEach((v, i) => {
    f.text(mx - 20, my + i * ch + ch / 2, v, { bold: true, mono: true });
    f.text(mx + i * cw + cw / 2, my - 14, v, { bold: true, mono: true });
  });
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
    const row = i === 1, col = j === 1;
    const tone = row && col ? 'violet' : row ? 'green' : col ? 'amber' : undefined;
    f.rect(mx + j * cw, my + i * ch, cw, ch, { tone, rx: 0, sw: tone ? 1.4 : 1 });
    f.text(mx + j * cw + cw / 2, my + i * ch + ch / 2, String(A[i][j]), { mono: true, bold: A[i][j] === 1, tone, muted: !A[i][j] && !tone });
  }
  f.text(mx + 4 * cw + 14, my + ch * 1.5, '行和 = 2（出度）', { anchor: 'start', size: 12.5, tone: 'green', bold: true });
  f.text(mx + cw * 1.5, my + 4 * ch + 18, '列和 = 1（入度）', { size: 12.5, tone: 'amber', bold: true });
  f.text(525, 262, 'Edge[u][v] ≠ 0 表示弧 u→v；2 > 1 ⇒ b 是 K 顶点', { size: 12, subtle: true });
  f.save('2023-41-1');
}

/* ---------- 2024-41 拓扑序唯一：每轮只能有一个零入度顶点 ---------- */
{
  const f = new Fig(740, 470);
  const pos = { 1: [0, 40], 2: [70, 0], 3: [70, 80], 4: [140, 40] };
  const drawRound = (ox, oy, E, removed, Z, title, verdict) => {
    f.panel(ox, oy, 172, 196, title, { titleSize: 12 });
    const N = {};
    for (const [id, [x, y]] of Object.entries(pos)) N[id] = { x: ox + 16 + x, y: oy + 64 + y, r: 15, ghost: removed.includes(+id), tone: Z.includes(+id) ? (Z.length === 1 ? 'green' : 'red') : undefined, size: 13 };
    f.graph(N, E.map(([u, v]) => ({ u, v, ghost: removed.includes(u) || removed.includes(v) })), { r: 15, directed: true });
    f.text(ox + 86, oy + 178, verdict, { size: 11.5, bold: true, tone: Z.length === 1 ? 'green' : 'red' });
  };
  const U = [[1, 2], [1, 3], [2, 3], [2, 4], [3, 4]];
  f.text(20, 22, '例 1：每轮候选集合都只有 1 个顶点 ⇒ 拓扑序唯一（1, 2, 3, 4）', { anchor: 'start', size: 13, bold: true, tone: 'green' });
  [[[], [1]], [[1], [2]], [[1, 2], [3]], [[1, 2, 3], [4]]].forEach(([rm, Z], k) => drawRound(10 + k * 182, 34, U, rm, Z, `第 ${k + 1} 轮`, `Z = {${Z.join(',')}}`));
  const M = [[1, 2], [1, 3], [2, 4], [3, 4]];
  f.text(20, 252, '例 2：第 2 轮候选集合 {2, 3} ⇒ 2、3 谁先都行，不唯一，返回 0', { anchor: 'start', size: 13, bold: true, tone: 'red' });
  drawRound(10, 264, M, [], [1], '第 1 轮', 'Z = {1}');
  drawRound(192, 264, M, [1], [2, 3], '第 2 轮', 'Z = {2,3}，|Z| ≠ 1');
  f.panel(374, 264, 356, 196, '');
  f.text(392, 292, 'Kahn 算法 + 统计候选数：', { anchor: 'start', size: 12.5, bold: true });
  f.text(392, 318, '|Z| = 1：唯一选择，删除它并更新入度', { anchor: 'start', size: 12, tone: 'green' });
  f.text(392, 342, '|Z| ≥ 2：出现分叉 ⇒ 不唯一', { anchor: 'start', size: 12, tone: 'red' });
  f.text(392, 366, '|Z| = 0 且未删完：有环 ⇒ 无拓扑序', { anchor: 'start', size: 12, tone: 'amber' });
  f.text(392, 398, '后两种都返回 0', { anchor: 'start', size: 12, subtle: true });
  f.save('2024-41-1');
}

/* ---------- 2025-42 AOE 网 ---------- */
const P25 = { 1: { x: 140, y: 50 }, 2: { x: 380, y: 50 }, 3: { x: 40, y: 150 }, 4: { x: 260, y: 150 }, 5: { x: 520, y: 150 }, 6: { x: 140, y: 250 }, 7: { x: 380, y: 250 } };
const A25 = [
  ['a', 1, 3, 2], ['b', 1, 2, 5], ['d', 1, 4, 3], ['c', 3, 6, 1], ['e', 3, 4, 3], ['f', 4, 2, 4],
  ['g', 4, 6, 1], ['j', 4, 5, 1], ['m', 4, 7, 4], ['h', 6, 7, 1], ['k', 2, 5, 2], ['n', 7, 5, 3],
];
const VE = { 1: 0, 2: 9, 3: 2, 4: 5, 5: 12, 6: 6, 7: 9 };
const VL = { 1: 0, 2: 10, 3: 2, 4: 5, 5: 12, 6: 8, 7: 9 };
{
  const f = new Fig(740, 380);
  const N = {};
  for (const [id, p] of Object.entries(P25)) {
    const crit = VE[id] === VL[id];
    N[id] = { x: 70 + p.x, y: 40 + p.y, r: 20, tone: crit ? 'green' : 'gray' };
  }
  const edges = A25.map(([nm, u, v, w]) => {
    const tf = VL[v] - VE[u] - w;
    return { u, v, w: tf === 0 ? `${nm}=${w}` : `${nm}=${w} · ${tf}`, tone: tf === 0 ? 'green' : nm === 'j' ? 'amber' : undefined, dir: true, dash: tf !== 0, sw: tf === 0 ? 2.8 : 1.4, size: 11.5 };
  });
  f.graph(N, edges, { r: 20 });
  const tagPos = { 1: [0, -36], 2: [0, -36], 3: [-6, -38], 4: [0, -38], 5: [0, -38], 6: [0, 38], 7: [0, 38] };
  for (const [id, [dx, dy]] of Object.entries(tagPos)) {
    const crit = VE[id] === VL[id];
    f.chip(N[id].x + dx, N[id].y + dy, `${VE[id]} / ${VL[id]}`, { tone: crit ? 'green' : 'amber', size: 11, mono: true });
  }
  f.legend(40, 360, [{ kind: 'line', tone: 'green', label: '关键活动 a→e→m→n，工期 12' }, { kind: 'dash', label: '非关键（标注总时差）' }, { tone: 'amber', label: '结点上为 ve / vl' }], { size: 12 });
  f.save('2025-42-1');
}
{
  // Gantt chart
  const f = new Fig(740, 470);
  const X0 = 110, U = 46, Y0 = 56, RH = 28;
  const acts = A25.map(([nm, u, v, w]) => ({ nm, u, v, w, es: VE[u], ls: VL[v] - w })).sort((p, q) => p.es - q.es || p.nm.localeCompare(q.nm));
  // e window band
  f.raw(`<rect x="${X0 + 2 * U}" y="${Y0 - 14}" width="${3 * U}" height="${acts.length * RH + 14}" class="f-blue" opacity="0.55"/>`);
  f.text(X0 + 3.5 * U, Y0 - 22, 'e 执行区间 [2, 5]', { size: 12, tone: 'blue', bold: true });
  for (let t = 0; t <= 12; t += 1) {
    f.line(X0 + t * U, Y0 - 8, X0 + t * U, Y0 + acts.length * RH, { cls: 'faint', sw: t % 3 === 0 ? 1 : 0.5 });
    f.text(X0 + t * U, Y0 + acts.length * RH + 14, String(t), { size: 11.5, mono: true, muted: true });
  }
  acts.forEach((a, i) => {
    const y = Y0 + i * RH + 4;
    const crit = a.es === a.ls;
    const overlap = ['b', 'c', 'd'].includes(a.nm);
    f.text(X0 - 14, y + 10, `${a.nm}  ${a.u}→${a.v}`, { anchor: 'end', size: 12.5, mono: true, bold: true, tone: crit ? 'green' : overlap ? 'violet' : undefined });
    // slack window
    if (!crit) f.rect(X0 + a.es * U, y + 2, (a.ls + a.w - a.es) * U, 16, { rx: 8, tone: 'gray', sw: 0.8, dash: true });
    f.rect(X0 + a.es * U, y, a.w * U, 20, { rx: 5, tone: crit ? 'green' : overlap ? 'violet' : 'gray' });
    f.text(X0 + a.es * U + a.w * U / 2, y + 10, `${a.w}`, { size: 11.5, mono: true, bold: true, tone: crit ? 'green' : overlap ? 'violet' : 'gray' });
    if (!crit) f.text(X0 + (a.ls + a.w) * U + 6, y + 10, `余量 ${a.ls - a.es}`, { anchor: 'start', size: 11, tone: a.nm === 'j' ? 'amber' : undefined, subtle: a.nm !== 'j', bold: a.nm === 'j' });
  });
  f.legend(X0, 448, [{ tone: 'green', label: '关键活动' }, { tone: 'violet', label: '可能与 e 同时进行：b、c、d' }, { kind: 'dash', label: '虚线框：最早开始 ~ 最迟结束' }], { size: 12 });
  f.save('2025-42-2');
}
