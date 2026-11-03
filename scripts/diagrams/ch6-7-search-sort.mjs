// 第 6 章 查找 / 第 7 章 排序：真题解析配图。
import { Fig } from './lib.mjs';

/* ---------- 2010-41 线性探测散列表 ---------- */
{
  const keys = [7, 8, 30, 11, 18, 9, 14];
  const m = 10;
  const table = Array(m).fill(null);
  const trails = keys.map((k) => {
    const h = (3 * k) % 7;
    const t = [];
    let a = h;
    while (table[a] !== null) { t.push(a); a = (a + 1) % m; }
    t.push(a);
    table[a] = k;
    return { k, h, t };
  });
  const f = new Fig(740, 420);
  const X0 = 150, W = 52, RH = 34, Y0 = 56;
  f.text(20, 24, '构造过程：每行是一次插入，灰格为发生冲突的探测地址，彩色为最终落点', { anchor: 'start', size: 13, bold: true, subtle: true });
  for (let a = 0; a < m; a += 1) f.text(X0 + a * W + W / 2, Y0 - 10, String(a), { size: 12, mono: true, muted: true });
  trails.forEach((tr, r) => {
    const y = Y0 + r * RH;
    f.text(20, y + RH / 2, `${tr.k}`, { anchor: 'start', mono: true, bold: true, size: 14 });
    f.text(60, y + RH / 2, `H=${tr.h}`, { anchor: 'start', mono: true, size: 12, subtle: true });
    for (let a = 0; a < m; a += 1) f.rect(X0 + a * W + 2, y + 3, W - 4, RH - 6, { rx: 4, sw: 0.6, cls: 'faint', ghost: true });
    tr.t.forEach((a, i) => {
      const last = i === tr.t.length - 1;
      f.rect(X0 + a * W + 2, y + 3, W - 4, RH - 6, { rx: 4, tone: last ? (tr.t.length > 1 ? 'amber' : 'green') : 'gray' });
      f.text(X0 + a * W + W / 2, y + RH / 2, last ? String(tr.k) : `${i + 1}`, { mono: true, bold: last, size: last ? 13.5 : 11.5, tone: last ? (tr.t.length > 1 ? 'amber' : 'green') : 'gray' });
      if (i > 0) f.line(X0 + tr.t[i - 1] * W + W - 3, y + RH / 2, X0 + a * W + 3, y + RH / 2, { arrow: 'end', tone: 'gray', sw: 1.2 });
    });
    f.text(X0 + m * W + 14, y + RH / 2, `${tr.t.length} 次`, { anchor: 'start', size: 12, bold: true, tone: tr.t.length > 1 ? 'amber' : 'green' });
  });
  const ty = Y0 + keys.length * RH + 30;
  f.text(20, ty + 18, '最终表', { anchor: 'start', bold: true });
  f.array(X0, ty, table.map((v) => (v === null ? '' : v)), { w: W, h: 36, tones: (i, v) => (v === '' ? undefined : 'blue'), size: 14 });
  f.text(X0 + m * W + 10, ty + 18, 'm = 10', { anchor: 'start', size: 12, mono: true, subtle: true });
  f.text(370, ty + 62, '表长 m = 7 / 0.7 = 10；ASL成功 = (1+1+1+1+3+3+2)/7 = 12/7', { size: 13.5, bold: true, tone: 'green', mono: true });
  f.save('2010-41-1');
}
{
  const table = [7, 14, null, 8, null, 11, 30, 18, 9, null];
  const f = new Fig(740, 384);
  const X0 = 150, W = 52;
  f.text(20, 24, '查找失败：从初址 H（只可能是 0~6）出发，一直探测到第一个空单元为止', { anchor: 'start', size: 13, bold: true, subtle: true });
  f.array(X0, 58, table.map((v) => (v === null ? '空' : v)), { w: W, h: 34, tones: (i, v) => (v === '空' ? 'green' : 'blue'), idx: true, idxPos: 'above', size: 13.5 });
  let total = 0;
  for (let h = 0; h < 7; h += 1) {
    const y = 112 + h * 34;
    let a = h;
    const path = [a];
    while (table[a] !== null) { a = (a + 1) % 10; path.push(a); }
    total += path.length;
    f.text(20, y + 14, `H = ${h}`, { anchor: 'start', mono: true, bold: true, size: 13 });
    const x1 = X0 + path[0] * W + 8, x2 = X0 + path[path.length - 1] * W + W - 8;
    f.rect(x1, y + 3, x2 - x1, 22, { rx: 11, tone: path.length >= 4 ? 'red' : path.length >= 2 ? 'amber' : 'green', sw: 1.2 });
    path.forEach((p, i) => f.text(X0 + p * W + W / 2, y + 14, i === path.length - 1 ? '空' : String(i + 1), { size: 11.5, mono: true, bold: true, tone: path.length >= 4 ? 'red' : path.length >= 2 ? 'amber' : 'green' }));
    f.text(X0 + 10 * W + 14, y + 14, `${path.length} 次`, { anchor: 'start', size: 12.5, bold: true });
  }
  f.text(370, 366, `ASL失败 = (3+2+1+2+1+5+4)/7 = ${total}/7`, { size: 13.5, bold: true, tone: 'red', mono: true });
  f.save('2010-41-2');
}

/* ---------- 2013-42 加权 ASL：顺序表 vs BST ---------- */
{
  const f = new Fig(740, 330);
  f.panel(10, 8, 330, 314, '顺序表：按概率降序排，顺序查找');
  const items = [['do', 0.35], ['while', 0.35], ['for', 0.15], ['repeat', 0.15]];
  items.forEach(([k, p], i) => {
    const y = 56 + i * 52;
    f.text(40, y + 15, `${i + 1}`, { mono: true, bold: true, tone: 'violet' });
    f.rect(60, y, 90, 32, { tone: 'blue', rx: 5 });
    f.text(105, y + 16, k, { mono: true, bold: true, tone: 'blue' });
    f.rect(162, y + 6, p * 300, 20, { tone: 'amber', rx: 4, sw: 1 });
    f.text(170 + p * 300, y + 16, `${p}×${i + 1}`, { anchor: 'start', size: 12, mono: true });
  });
  f.text(175, 280, 'ASL = 0.35+0.70+0.45+0.60 = 2.1', { size: 13, bold: true, tone: 'green', mono: true });
  f.text(175, 302, '概率大的放前面（交换论证）', { size: 12, subtle: true });

  f.panel(350, 8, 380, 314, '二叉链表：二叉排序树（中序必须有序）');
  const L = (k, p, d, side, extra = {}) => ({ label: k, size: 12, r: 26, tone: p > 0.3 ? 'blue' : 'gray', note: `p=${p}·第${d}层`, noteTone: p > 0.3 ? 'blue' : undefined, noteDy: 0, noteDx: side * 74, ...extra });
  f.tree({ ...L('for', 0.15, 1, 1), children: [L('do', 0.35, 2, -1), { ...L('while', 0.35, 2, 1), children: [L('repeat', 0.15, 3, -1), null] }] }, { x: 470, y: 72, dx: 66, dy: 76 });
  f.text(540, 280, 'ASL = 0.15×1+0.35×2+0.35×2+0.15×3 = 2.0', { size: 12.5, bold: true, tone: 'green', mono: true });
  f.text(540, 302, 'do < for < repeat < while（字典序）', { size: 12, subtle: true });
  f.save('2013-42-1');
}

/* ---------- 2022-41 顺序存储二叉树的 BST 判定 ---------- */
function sqTree(f, ox, oy, arr, title, inorder, badAt) {
  f.panel(ox, oy, 355, 400, title);
  const a = f.array(ox + 14, oy + 44, arr.map((v) => (v === -1 ? '−1' : v)), { w: 30, h: 28, idx: true, size: 12, tones: (i, v) => (v === '−1' ? 'gray' : undefined), ghost: arr.map((v, i) => (v === -1 ? i : -9)) });
  // build tree spec from array
  const build = (i) => (i >= arr.length || arr[i] === -1 ? null : { label: String(arr[i]), note: `[${i}]`, noteDy: -26, size: 13, children: [build(2 * i + 1), build(2 * i + 2)] });
  const spec = build(0);
  const prune = (s) => { if (!s) return s; s.children = s.children.map(prune); if (s.children.every((c) => !c)) s.children = []; return s; };
  f.tree(prune(spec), { x: ox + 70, y: oy + 130, dx: 50, dy: 52 });
  f.text(ox + 20, oy + 334, '中序：', { anchor: 'start', size: 12.5, bold: true });
  inorder.forEach((v, i) => {
    const tone = badAt === undefined ? 'green' : i === badAt || i === badAt - 1 ? 'red' : undefined;
    f.chip(ox + 84 + i * 50, oy + 334, String(v), { tone: tone ?? 'gray', mono: true, size: 12.5, w: 38 });
    if (i > 0) f.text(ox + 84 + i * 50 - 25, oy + 334, i === badAt ? '>' : '<', { size: 13, bold: true, tone: i === badAt ? 'red' : 'green' });
  });
}
{
  const f = new Fig(740, 420);
  sqTree(f, 10, 8, [40, 25, 60, -1, 30, -1, 80, -1, -1, 27], 'T1：中序严格递增 ⇒ 是 BST', [25, 27, 30, 40, 60, 80]);
  sqTree(f, 375, 8, [40, 50, 60, -1, 30, -1, -1, -1, -1, -1, 35], 'T2：50 > 30，立即返回 false', [50, 30, 35, 40, 60], 1);
  f.text(187, 380, '下标 i 的孩子：2i+1、2i+2；−1 表示空', { size: 12, subtle: true });
  f.text(552, 380, '只记前驱 prev，不必保存整个中序序列', { size: 12, subtle: true });
  f.save('2022-41-1');
}

/* ---------- 2024-42 单向平方探测 ---------- */
{
  const f = new Fig(740, 400);
  const m = 11, X0 = 60, W = 56;
  const table = [11, null, 14, 7, null, 20, 9, null, null, 3, 18];
  f.text(20, 18, 'H₀ = 3·key mod 11；冲突时 Hₖ = (H₀ + k²) mod 11', { anchor: 'start', size: 13, bold: true, subtle: true });
  const a = f.array(X0, 150, table.map((v) => (v === null ? '' : v)), { w: W, h: 38, idx: true, idxPos: 'above', size: 15, tones: { 2: 'amber', 3: 'violet', 6: 'teal' } });
  const cx = (i) => X0 + i * W + W / 2;
  // insertion arcs above
  const arcs = [
    { key: 9, seq: [5, 6], tone: 'teal' },
    { key: 14, seq: [9, 10, 2], tone: 'amber' },
    { key: 7, seq: [10, 0, 3], tone: 'violet' },
  ];
  arcs.forEach((ar, idx) => {
    for (let i = 1; i < ar.seq.length; i += 1) {
      const x1 = cx(ar.seq[i - 1]), x2 = cx(ar.seq[i]);
      const bend = -(26 + Math.abs(x2 - x1) * 0.18 + idx * 8);
      f.curve(x1, 134, x2, 134, x2 > x1 ? bend : -bend, { tone: ar.tone, arrow: 'end', sw: 1.6 });
    }
  });
  f.chip(cx(5) + 28, 98, '9：5→6', { tone: 'teal', size: 11.5 });
  f.chip(cx(6) - 10, 44, '14：9→10→2（+1，+4）', { tone: 'amber', size: 11.5 });
  f.chip(cx(2) - 4, 66, '7：10→0→3（+1，+4）', { tone: 'violet', size: 11.5 });
  // search 8 below
  const seq8 = [2, 3, 6, 0, 7];
  for (let i = 1; i < seq8.length; i += 1) {
    const x1 = cx(seq8[i - 1]), x2 = cx(seq8[i]);
    const bend = 22 + Math.abs(x2 - x1) * 0.16;
    f.curve(x1, 238, x2, 238, x2 > x1 ? bend : -bend, { tone: 'red', arrow: 'end', sw: 1.6, dash: true });
  }
  seq8.forEach((p, i) => f.chip(cx(p), 224, `k=${i}`, { tone: 'red', size: 10.5, mono: true, w: 34 }));
  f.text(370, 316, '查找 8：H₀ = 2 → 3 → 6 → 0 → 7（空）⇒ 失败，第一个空地址为 7', { size: 13, bold: true, tone: 'red' });
  f.text(370, 344, '查找 14：探测 9 → 10 → 2，依次与 3、18、14 比较（3 次）', { size: 13, bold: true, tone: 'amber' });
  f.text(370, 376, '装填因子 α = 7/11；k² mod 11 只能取 {0,1,3,4,5,9}，单向平方探测不一定覆盖全表', { size: 12, subtle: true });
  f.save('2024-42-1');
}

/* ---------- 2026-41 BST 中与 K 最接近的结点 ---------- */
{
  const f = new Fig(740, 330);
  f.panel(10, 8, 440, 314, 'K = 12：沿查找路径走，每步舍弃一棵子树');
  const N = (label, extra = {}) => ({ label, size: 13, ...extra });
  const spec = N('10', { tone: 'blue', note: '|10−12| = 2', noteTone: 'blue', noteDx: -62, noteDy: 0, children: [
    N('4', { ghost: true, edgeGhost: true, children: [N('2', { ghost: true }), N('7', { ghost: true })] }),
    N('18', { tone: 'gray', edgeTone: 'blue', note: '|18−12| = 6', noteDx: 40, noteDy: -24, children: [
      N('14', { tone: 'blue', edgeTone: 'blue', note: '|14−12| = 2', noteTone: 'blue', noteDx: -44, noteDy: 32, children: [null, N('16', { ghost: true })] }),
      N('25', { ghost: true }),
    ] }),
  ] });
  f.tree(spec, { x: 60, y: 60, dx: 56, dy: 70 });
  f.text(230, 300, '灰色子树离 K 更远，整棵舍弃；14 的左孩子为空，结束', { size: 12, subtle: true });

  f.panel(460, 8, 270, 314, '结论');
  const rows = [
    ['10 < 12 → 右走', '左子树都 < 10，更远'],
    ['18 > 12 → 左走', '右子树都 > 18，更远'],
    ['14 > 12 → 左走', '左孩子为空，停'],
  ];
  rows.forEach(([a, b], i) => {
    f.text(476, 58 + i * 46, a, { anchor: 'start', size: 12.5, bold: true, mono: true });
    f.text(476, 78 + i * 46, b, { anchor: 'start', size: 11.5, subtle: true });
  });
  f.text(476, 210, '最小差 = 2', { anchor: 'start', size: 15, bold: true, tone: 'green' });
  f.text(476, 236, '结点：10（前驱）和 14（后继）', { anchor: 'start', size: 12.5, bold: true, tone: 'green' });
  f.text(476, 272, '只走一条路径：O(h) 时间', { anchor: 'start', size: 12, subtle: true });
  f.text(476, 294, '并列时两个都要输出', { anchor: 'start', size: 12, subtle: true });
  f.save('2026-41-1');
}

/* ---------- 2016-43 划分：小的一半 vs 大的一半 ---------- */
{
  const f = new Fig(740, 436);
  f.panel(10, 8, 720, 194, '目标：先让 |n₁ − n₂| 最小，再让 |S₁ − S₂| 最大 ⇒ 最小的 ⌊n/2⌋ 个数一组');
  const vals = [1, 3, 4, 5, 9, 12, 20];
  vals.forEach((v, i) => {
    const x = 80 + i * 62, base = 170;
    const tone = i < 3 ? 'blue' : 'amber';
    f.rect(x, base - 10 - v * 5, 40, 10 + v * 5, { tone, rx: 4 });
    f.text(x + 20, base - 10 - v * 5 - 10, String(v), { mono: true, bold: true, tone, size: 13 });
  });
  f.line(80 + 3 * 62 - 11, 50, 80 + 3 * 62 - 11, 182, { tone: 'red', dash: true, sw: 1.6 });
  f.text(80 + 3 * 62 - 11, 192, 'k = ⌊7/2⌋ = 3', { size: 12, tone: 'red', bold: true, mono: true });
  f.text(560, 80, 'A₁ = {1, 3, 4}，S₁ = 8', { anchor: 'start', size: 13, tone: 'blue', bold: true });
  f.text(560, 106, 'A₂ = {5, 9, 12, 20}，S₂ = 46', { anchor: 'start', size: 13, tone: 'amber', bold: true });
  f.text(560, 136, '|S₁ − S₂| = 38（最大）', { anchor: 'start', size: 13.5, tone: 'green', bold: true });
  f.text(560, 162, '组内不必有序', { anchor: 'start', size: 12, subtle: true });

  f.panel(10, 214, 720, 214, '快速选择（三路划分）：只递归包含位置 k 的那一段');
  const arr = [3, 1, 4, 5, 5, 5, 12, 9, 20];
  const tones = (i) => (i < 3 ? 'blue' : i < 6 ? 'violet' : 'amber');
  const a = f.array(120, 284, arr, { w: 50, h: 36, tones, idx: true, size: 14 });
  f.brace(a.x(0) + 2, a.x(3) - 2, 346, '< pivot', { tone: 'blue' });
  f.brace(a.x(3) + 2, a.x(6) - 2, 346, '= pivot', { tone: 'violet' });
  f.brace(a.x(6) + 2, a.right - 2, 346, '> pivot', { tone: 'amber' });
  f.pointer(a.cx(3), 282, 'lt', { tone: 'violet', len: 16, size: 12 });
  f.pointer(a.cx(5), 282, 'gt', { tone: 'violet', len: 16, size: 12 });
  f.text(370, 382, 'k < lt：只处理左段；k > gt+1：只处理右段；否则前 k 个已是最小的 k 个', { size: 12.5, bold: true });
  f.text(370, 404, '期望 O(n)，最坏 O(n²)；不必整体排序（排序需 O(n log n)）', { size: 12, subtle: true });
  f.save('2016-43-1');
}

/* ---------- 2021-42 比较计数排序 ---------- */
{
  const a = [25, -10, 25, 10, 11, 19];
  const n = a.length;
  const count = Array(n).fill(0);
  const cell = {};
  for (let i = 0; i < n - 1; i += 1) for (let j = i + 1; j < n; j += 1) {
    if (a[i] < a[j]) { count[j] += 1; cell[`${i},${j}`] = 'j'; } else { count[i] += 1; cell[`${i},${j}`] = 'i'; }
  }
  const f = new Fig(740, 380);
  f.panel(10, 8, 440, 364, '每对 (i, j)，i < j 比较一次：较大者 count++');
  const X0 = 136, Y0 = 72, C = 42;
  const lab = (i) => `${a[i]}`;
  for (let j = 0; j < n; j += 1) {
    f.text(X0 + j * C + C / 2, Y0 - 26, `j=${j}`, { size: 11, mono: true, muted: true });
    f.text(X0 + j * C + C / 2, Y0 - 10, lab(j), { size: 12.5, mono: true, bold: true });
  }
  for (let i = 0; i < n; i += 1) {
    f.text(X0 - 50, Y0 + i * C + C / 2, `i=${i}`, { size: 11, mono: true, muted: true });
    f.text(X0 - 16, Y0 + i * C + C / 2, lab(i), { size: 12.5, mono: true, bold: true, anchor: 'end' });
    for (let j = 0; j < n; j += 1) {
      const x = X0 + j * C, y = Y0 + i * C;
      if (j <= i) { f.rect(x + 2, y + 2, C - 4, C - 4, { rx: 4, ghost: true, sw: 0.6 }); continue; }
      const who = cell[`${i},${j}`];
      const eq = a[i] === a[j];
      f.rect(x + 2, y + 2, C - 4, C - 4, { rx: 4, tone: eq ? 'red' : who === 'i' ? 'blue' : 'amber', sw: eq ? 2 : 1.2 });
      f.text(x + C / 2, y + C / 2, who === 'i' ? '←i' : '↑j', { size: 12.5, bold: true, tone: eq ? 'red' : who === 'i' ? 'blue' : 'amber' });
    }
  }
  f.text(230, 350, '红格：25 与 25 相等，条件 a[i] < a[j] 为假 ⇒ count[0]++', { size: 11.5, tone: 'red', bold: true });

  f.panel(460, 8, 270, 364, '');
  f.text(476, 34, 'count[i] = 排在它前面的个数', { anchor: 'start', size: 12.5, bold: true });
  a.forEach((v, i) => {
    const y = 56 + i * 40;
    f.text(490, y + 14, `a[${i}] = ${v}`, { anchor: 'start', mono: true, size: 12.5 });
    f.chip(640, y + 14, `count = ${count[i]}`, { tone: i === 0 || i === 2 ? 'red' : 'green', mono: true, size: 12 });
  });
  f.text(476, 310, '比较总次数 = n(n−1)/2 = 15', { anchor: 'start', size: 12.5, bold: true, tone: 'violet' });
  f.text(476, 336, '← 行号 i 加 1　↑ 列号 j 加 1', { anchor: 'start', size: 12, subtle: true });
  f.save('2021-42-1');
}
{
  const f = new Fig(740, 300);
  const a = [25, -10, 25, 10, 11, 19];
  const variants = [
    { t: '原算法（a[i] < a[j]）：两个 25 交换了先后 ⇒ 不稳定', count: [5, 0, 4, 1, 2, 3], ok: false },
    { t: '改为 a[i] <= a[j]：相等时后出现者 count++ ⇒ 稳定', count: [4, 0, 5, 1, 2, 3], ok: true },
  ];
  variants.forEach((vr, k) => {
    const oy = 8 + k * 144;
    f.panel(10, oy, 720, 136, vr.t);
    const X = 140, W = 70;
    const top = oy + 40, bot = oy + 96;
    f.text(60, top + 14, 'a', { bold: true, mono: true });
    f.text(60, bot + 14, 'b', { bold: true, mono: true });
    a.forEach((v, i) => {
      const id = i === 0 ? 'blue' : i === 2 ? 'amber' : undefined;
      f.rect(X + i * W, top, W - 8, 28, { tone: id, rx: 4 });
      f.text(X + i * W + (W - 8) / 2, top + 14, i === 0 ? '25ᵃ' : i === 2 ? '25ᵇ' : String(v), { mono: true, bold: !!id, tone: id, size: 13 });
      const p = vr.count[i];
      f.rect(X + p * W, bot, W - 8, 28, { tone: id, rx: 4 });
      f.text(X + p * W + (W - 8) / 2, bot + 14, i === 0 ? '25ᵃ' : i === 2 ? '25ᵇ' : String(v), { mono: true, bold: !!id, tone: id, size: 13 });
      f.line(X + i * W + (W - 8) / 2, top + 30, X + p * W + (W - 8) / 2, bot - 2, { arrow: 'end', tone: id ?? undefined, sw: id ? 2 : 1, ghost: !id });
    });
    f.text(X + 6 * W + 10, bot + 14, vr.ok ? '✓ 稳定' : '✗ 不稳定', { anchor: 'start', size: 13.5, bold: true, tone: vr.ok ? 'green' : 'red' });
  });
  f.save('2021-42-2');
}

/* ---------- 2022-42 容量为 10 的大根堆 ---------- */
{
  const f = new Fig(740, 380);
  const heap = (ox, oy, vals, tones = {}, notes = {}) => {
    const pos = vals.map((_, i) => {
      const l = Math.floor(Math.log2(i + 1));
      const p = i + 1 - 2 ** l;
      return [ox + ((p + 0.5) * 320) / 2 ** l, oy + l * 62];
    });
    vals.forEach((_, i) => {
      if (i === 0) return;
      const [x1, y1] = pos[Math.floor((i - 1) / 2)], [x2, y2] = pos[i];
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const on = tones[i] && tones[Math.floor((i - 1) / 2)];
      f.line(x1 + Math.cos(ang) * 17, y1 + Math.sin(ang) * 17, x2 - Math.cos(ang) * 17, y2 - Math.sin(ang) * 17, { tone: on ? tones[i] : undefined, sw: on ? 2.2 : 1.4 });
    });
    vals.forEach((v, i) => {
      f.node(pos[i][0], pos[i][1], String(v), { r: 17, tone: tones[i], size: 13 });
      if (notes[i]) f.text(pos[i][0] + (notes[i].dx ?? 0), pos[i][1] + (notes[i].dy ?? -27), notes[i].s, { size: 11.5, bold: true, tone: tones[i] });
    });
  };
  f.panel(10, 8, 355, 300, '当前 10 个候选（大根堆），堆顶 = 门槛');
  heap(28, 76, [42, 35, 38, 20, 31, 12, 26, 5, 18, 9], { 0: 'red' }, { 0: { s: '第 10 小' } });
  f.panel(375, 8, 355, 300, '读入 15 < 42：替换堆顶并下沉');
  heap(393, 76, [38, 35, 26, 20, 31, 12, 15, 5, 18, 9], { 0: 'green', 2: 'green', 6: 'green' }, { 6: { s: '15 落位', dy: 30 } });
  f.text(552, 290, '下沉路径：15 ↔ 38 ↔ 26', { size: 12, tone: 'green', bold: true });
  f.panel(10, 318, 720, 54, '');
  f.text(28, 345, '对每个新数 x：', { anchor: 'start', size: 12.5, bold: true });
  f.text(130, 345, 'x ≥ 堆顶 → 直接丢弃（只比较 1 次）', { anchor: 'start', size: 12.5, tone: 'gray', bold: true });
  f.text(400, 345, 'x < 堆顶 → 替换堆顶，下沉 O(log 10)', { anchor: 'start', size: 12.5, tone: 'green', bold: true });
  f.save('2022-42-1');
}

/* ---------- 2023-42 置换-选择排序 ---------- */
{
  const input = [51, 94, 37, 92, 14, 63, 15, 99, 48, 56, 23, 60, 31, 17, 43, 8, 90, 166, 100];
  const m = 4;
  const slots = input.slice(0, m).map((v) => ({ v, frozen: false }));
  let next = m;
  let run = 0;
  const steps = [];
  while (slots.some((s) => s.v !== null)) {
    let active = slots.map((s, i) => [s, i]).filter(([s]) => s.v !== null && !s.frozen);
    if (active.length === 0) {
      run += 1;
      slots.forEach((s) => { s.frozen = false; });
      active = slots.map((s, i) => [s, i]).filter(([s]) => s.v !== null);
    }
    let best = active[0];
    for (const p of active) if (p[0].v < best[0].v) best = p;
    const snap = slots.map((s) => ({ ...s }));
    const out = best[0].v;
    let inVal = null, inFrozen = false;
    if (next < input.length) {
      inVal = input[next++];
      inFrozen = inVal < out;
      slots[best[1]] = { v: inVal, frozen: inFrozen };
    } else slots[best[1]] = { v: null, frozen: false };
    steps.push({ snap, sel: best[1], out, run, inVal, inFrozen });
  }
  const runTones = ['blue', 'amber', 'green'];
  const f = new Fig(760, 340);
  const X0 = 86, CW = 35, Y0 = 46, SH = 30;
  f.text(14, 22, '每列是一步：先在工作区（4 格）选出最小的活动记录输出，再读入下一个记录补位', { anchor: 'start', size: 12.5, bold: true, subtle: true });
  ['工作区 1', '工作区 2', '工作区 3', '工作区 4'].forEach((s, r) => f.text(14, Y0 + r * SH + SH / 2, s, { anchor: 'start', size: 11.5, subtle: true }));
  f.text(14, Y0 + 4 * SH + 22, '输出', { anchor: 'start', size: 12, bold: true });
  f.text(14, Y0 + 4 * SH + 58, '读入', { anchor: 'start', size: 12, bold: true });
  steps.forEach((st, c) => {
    const x = X0 + c * CW;
    st.snap.forEach((s, r) => {
      const y = Y0 + r * SH;
      if (s.v === null) { f.rect(x + 1, y + 1, CW - 2, SH - 2, { rx: 3, ghost: true, sw: 0.5 }); return; }
      const sel = r === st.sel;
      const tone = s.frozen ? 'gray' : runTones[st.run];
      f.rect(x + 1, y + 1, CW - 2, SH - 2, { rx: 3, tone: s.frozen ? undefined : tone, dash: s.frozen, sw: sel ? 2.4 : 0.9, ghost: false });
      f.text(x + CW / 2, y + SH / 2, String(s.v), { size: 11, mono: true, bold: sel, tone: s.frozen ? undefined : tone, muted: s.frozen });
    });
    const oy = Y0 + 4 * SH + 10;
    f.rect(x + 1, oy, CW - 2, 24, { rx: 4, solid: runTones[st.run] });
    f.raw(`<text x="${x + CW / 2}" y="${oy + 12.5}" text-anchor="middle" dominant-baseline="central" class="mono b" style="fill:var(--surface);font-size:11px">${st.out}</text>`);
    if (st.inVal !== null) {
      f.text(x + CW / 2, oy + 48, String(st.inVal), { size: 11, mono: true, bold: true, tone: st.inFrozen ? undefined : runTones[st.run], muted: st.inFrozen });
      f.text(x + CW / 2, oy + 64, st.inFrozen ? '冻结' : '活动', { size: 9.5, muted: st.inFrozen, tone: st.inFrozen ? undefined : runTones[st.run] });
    }
  });
  // run separators
  let start = 0;
  [0, 1, 2].forEach((r) => {
    const cnt = steps.filter((s) => s.run === r).length;
    const x1 = X0 + start * CW, x2 = X0 + (start + cnt) * CW;
    f.brace(x1 + 2, x2 - 2, Y0 + 4 * SH + 96, `R${r + 1}（${cnt} 个）`, { tone: runTones[r], bold: true, size: 12 });
    if (r > 0) f.line(x1, Y0 - 8, x1, Y0 + 4 * SH + 84, { cls: 'faint', dash: true, sw: 1.2 });
    start += cnt;
  });
  f.legend(X0, 330, [{ tone: 'blue', label: '活动记录（颜色 = 所属归并段）' }, { kind: 'ghost', label: '虚线灰字：冻结，留给下一段' }], { size: 11.5 });
  f.text(X0 + 470, 330, '粗框：本步输出的最小活动记录', { anchor: 'start', size: 11.5, subtle: true });
  f.save('2023-42-1');
}
