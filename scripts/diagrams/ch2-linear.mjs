// 第 2 章 线性表：真题解析配图。运行：node scripts/diagrams/ch2-linear.mjs
import { Fig } from './lib.mjs';

/* ---------- 2009-42 倒数第 k 个结点：快慢指针 ---------- */
{
  const vals = [12, 7, 25, 3, 19, 8, 30];
  const f = new Fig(740, 392);
  const X0 = 118, DW = 36, PW = 18, GAP = 24, STEP = DW + PW + GAP;
  const rows = [
    { y: 46, title: '① 初始化', note: 'fast、slow 都指向首元结点', fast: 0, slow: 0 },
    { y: 160, title: '② fast 先走', note: 'fast 前进 k−1 = 2 步，建立间距', fast: 2, slow: 0, gap: true },
    { y: 274, title: '③ 同步前进', note: 'fast 到达表尾时，slow 即倒数第 k 个', fast: 6, slow: 4, gap: true, done: true },
  ];
  for (const r of rows) {
    f.text(16, r.y + 30, r.title, { anchor: 'start', bold: true, size: 14 });
    f.text(16, r.y + 50, 'k = 3', { anchor: 'start', size: 12, muted: true, mono: true });
    const items = [{ v: 'H', tone: 'gray' }, ...vals.map((v, i) => ({
      v, tone: r.done && i === r.slow ? 'green' : undefined,
      ghost: false,
    }))];
    const nodes = f.list(X0, r.y + 22, items, { dw: DW, pw: PW, gap: GAP, h: 30 });
    const fn = nodes[r.fast + 1], sn = nodes[r.slow + 1];
    if (r.fast === r.slow) f.pointer(fn.left + DW / 2, fn.top - 2, 'slow = fast', { tone: 'blue', len: 20 });
    else {
      f.pointer(fn.left + DW / 2, fn.top - 2, 'fast', { tone: 'amber', len: 20 });
      f.pointer(sn.left + DW / 2, sn.top - 2, 'slow', { tone: 'blue', len: 20 });
    }
    if (r.gap) f.brace(sn.left + DW / 2, fn.left + DW / 2, r.y + 64, '相差 k−1 = 2 条 link', { tone: 'violet' });
    if (r.done) {
      f.text(sn.left + DW / 2, r.y + 98, '倒数第 3 个：输出 19，返回 1', { size: 12.5, bold: true, tone: 'green' });
    }
  }
  f.text(X0 + DW / 2 + 9, 52, '头结点', { size: 11.5, muted: true });
  f.save('2009-42-1');
}

/* ---------- 2010-42 循环左移：三次逆置 ---------- */
{
  const letters = 'abcdefgh'.split('');
  const p = 3;
  const W = 46, X0 = 150, Y0 = 34, RH = 94;
  const f = new Fig(680, 418);
  const toneOf = (ch) => (letters.indexOf(ch) < p ? 'blue' : 'amber');
  const states = [
    { arr: letters, title: '初始', formula: 'X Y', seg: [0, 2], segTone: 'blue', op: '逆置 R[0..p−1]' },
    { arr: ['c', 'b', 'a', 'd', 'e', 'f', 'g', 'h'], title: '① 逆置前段', formula: 'X^{R} Y', seg: [3, 7], segTone: 'amber', op: '逆置 R[p..n−1]' },
    { arr: ['c', 'b', 'a', 'h', 'g', 'f', 'e', 'd'], title: '② 逆置后段', formula: 'X^{R} Y^{R}', seg: [0, 7], segTone: 'violet', op: '逆置 R[0..n−1]' },
    { arr: ['d', 'e', 'f', 'g', 'h', 'a', 'b', 'c'], title: '③ 整体逆置', formula: '(X^{R}Y^{R})^{R} = Y X', done: true },
  ];
  states.forEach((s, r) => {
    const y = Y0 + r * RH;
    f.text(18, y + 18, s.title, { anchor: 'start', bold: true });
    const a = f.array(X0, y, s.arr, { w: W, h: 36, tones: (i, v) => toneOf(v), idx: r === 0 ? true : false, idxPos: 'above' });
    f.text(a.right + 22, y + 18, s.formula, { anchor: 'start', size: 15, bold: true, tone: s.done ? 'green' : undefined, italic: false });
    if (s.seg) {
      const [lo, hi] = s.seg;
      for (let i = lo, j = hi; i < j; i += 1, j -= 1) {
        f.curve(a.cx(i), y + 40, a.cx(j), y + 40, 10 + (j - i) * 4.2, { tone: s.segTone, arrow: 'both', sw: 1.3 });
      }
      f.text(a.cx(lo) + (a.cx(hi) - a.cx(lo)) / 2, y + 74, s.op, { size: 12, tone: s.segTone, bold: true });
    }
  });
  f.legend(X0, 412 - 8, [{ tone: 'blue', label: 'X = 前 p 个元素' }, { tone: 'amber', label: 'Y = 后 n−p 个元素' }]);
  f.text(18, 412 - 8, 'n = 8, p = 3', { anchor: 'start', size: 12, muted: true, mono: true });
  f.save('2010-42-1');
}

/* ---------- 2011-42 两等长有序序列的中位数：等量折半 ---------- */
{
  const A = [1, 3, 5, 7, 9], B = [2, 4, 6, 8, 10];
  const f = new Fig(760, 440);
  // 合并视角
  f.panel(14, 10, 732, 92, '合并视角：2n = 10 个数，题目所求是第 n = 5 小（下中位数）');
  const merged = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const mm = f.array(150, 46, merged, { w: 40, h: 32, tones: (i, v) => (v === 5 ? 'green' : v % 2 ? 'blue' : 'amber'), size: 14 });
  f.text(mm.cx(4), 90, '第 5 小', { size: 11.5, tone: 'green', bold: true });
  f.legend(590, 62, [{ tone: 'blue', label: '来自 A' }, { tone: 'amber', label: '来自 B' }], { gap: 12 });

  const rounds = [
    { a: [0, 4], b: [0, 4], ma: 2, mb: 2, cmp: 'A[m₁]=5 < B[m₂]=6', act: '留 A 右半、B 左半（奇数长保留中点）' },
    { a: [2, 4], b: [0, 2], ma: 3, mb: 1, cmp: '7 > 4', act: '留 A 左半、B 右半' },
    { a: [2, 3], b: [1, 2], ma: 2, mb: 1, cmp: '5 > 4', act: '偶数长：A 留左半含中点，B 留右半去中点' },
    { a: [2, 2], b: [2, 2], ma: 2, mb: 2, cmp: '各剩 1 个', act: 'min(5, 6) = 5', done: true },
  ];
  const Y = 128, RH = 76, W = 34;
  f.text(96, Y - 10, 'A', { bold: true, tone: 'blue' });
  f.text(96 + 5 * W + 40, Y - 10, 'B', { bold: true, tone: 'amber' });
  rounds.forEach((r, k) => {
    const y = Y + k * RH;
    f.text(18, y + 17, `第 ${k + 1} 轮`, { anchor: 'start', bold: true, size: 13 });
    const ghostA = A.map((_, i) => i).filter((i) => i < r.a[0] || i > r.a[1]);
    const ghostB = B.map((_, i) => i).filter((i) => i < r.b[0] || i > r.b[1]);
    const ax = 80, bx = 80 + 5 * W + 40;
    const ta = {}; const tb = {};
    if (r.done) { ta[r.ma] = 'green'; } else ta[r.ma] = 'blue';
    if (r.done) tb[r.mb] = 'gray'; else tb[r.mb] = 'amber';
    const aa = f.array(ax, y, A, { w: W, h: 32, ghost: ghostA, tones: ta, size: 14 });
    const bb = f.array(bx, y, B, { w: W, h: 32, ghost: ghostB, tones: tb, size: 14 });
    // live interval frame
    f.rect(aa.x(r.a[0]) - 3, y - 3, (r.a[1] - r.a[0] + 1) * W + 6, 38, { tone: 'blue', fill: false, rx: 6, sw: 1.2, dash: true });
    f.rect(bb.x(r.b[0]) - 3, y - 3, (r.b[1] - r.b[0] + 1) * W + 6, 38, { tone: 'amber', fill: false, rx: 6, sw: 1.2, dash: true });
    if (!r.done) {
      f.text(aa.cx(r.ma), y + 46, 'm₁', { size: 11.5, tone: 'blue', mono: true });
      f.text(bb.cx(r.mb), y + 46, 'm₂', { size: 11.5, tone: 'amber', mono: true });
    }
    const tx = bx + 5 * W + 26;
    f.text(tx, y + 8, r.cmp, { anchor: 'start', size: 13, bold: true, mono: !r.done, tone: r.done ? 'green' : undefined });
    f.text(tx, y + 28, r.act, { anchor: 'start', size: 12, subtle: !r.done, tone: r.done ? 'green' : undefined, bold: !!r.done });
  });
  f.legend(80, Y + 4 * RH - 4, [{ kind: 'ghost', label: '已舍弃（左右各舍同样多个）' }, { tone: 'blue', label: 'A 的下中位数' }, { tone: 'amber', label: 'B 的下中位数' }]);
  f.save('2011-42-1');
}

/* ---------- 2012-42 公共后缀：对齐剩余长度 ---------- */
function ylist(f, ox, oy, st) {
  // str1: H l o a d → i n g ; str2: H b e → i n g
  const S = 66, DW = 30, PW = 16;
  const top = ['H', 'l', 'o', 'a', 'd'];
  const bot = ['H', 'b', 'e'];
  const shared = ['i', 'n', 'g'];
  const pos = {};
  const nodes = {};
  top.forEach((c, i) => { pos[`t${i}`] = [ox + i * S, oy]; });
  bot.forEach((c, i) => { pos[`b${i}`] = [ox + (i + 2) * S, oy + 92]; });
  shared.forEach((c, i) => { pos[`s${i}`] = [ox + (5 + i) * S + 8, oy + 46]; });
  const draw = (key, label) => {
    const [x, y] = pos[key];
    const tone = st.tones?.[key] ?? (key[0] === 's' ? 'teal' : key.endsWith('0') && key[0] !== 's' ? 'gray' : undefined);
    nodes[key] = f.llnode(x, y, label, { dw: DW, pw: PW, h: 28, tone, ghost: st.ghost?.includes(key), nil: key === 's2' });
  };
  top.forEach((c, i) => draw(`t${i}`, c));
  bot.forEach((c, i) => draw(`b${i}`, c));
  shared.forEach((c, i) => draw(`s${i}`, c));
  const link = (a, b) => f.line(nodes[a].dot, nodes[a].cy, nodes[b].left - 2, nodes[b].cy, { arrow: 'end', sw: 1.3 });
  for (let i = 0; i < 4; i += 1) link(`t${i}`, `t${i + 1}`);
  for (let i = 0; i < 2; i += 1) link(`b${i}`, `b${i + 1}`);
  link('t4', 's0'); link('b2', 's0'); link('s0', 's1'); link('s1', 's2');
  f.text(pos.t0[0] - 34, oy + 14, 'str1', { mono: true, bold: true, size: 12.5 });
  f.text(pos.b0[0] - 34, oy + 92 + 14, 'str2', { mono: true, bold: true, size: 12.5 });
  return { nodes, pos, DW };
}
{
  const f = new Fig(720, 492);
  // panel 1
  f.panel(10, 8, 700, 236, '① 求长：m = 7，n = 5；长链 str1 先走 m − n = 2 步');
  const g1 = ylist(f, 84, 80, { tones: { t3: 'amber', b1: 'blue' }, ghost: ['t1', 't2'] });
  f.curve(g1.nodes.t1.left + 15, g1.nodes.t1.top - 6, g1.nodes.t3.left + 15, g1.nodes.t3.top - 6, -14, { tone: 'amber', arrow: 'end', sw: 1.4 });
  f.text((g1.nodes.t1.left + g1.nodes.t3.left) / 2 + 15, g1.nodes.t1.top - 26, '先走 2 步', { size: 11.5, tone: 'amber', bold: true });
  f.text(g1.nodes.t1.left + 15, g1.nodes.t1.bottom + 12, '起点', { size: 11, muted: true });
  f.pointer(g1.nodes.t3.left + 15, g1.nodes.t3.bottom + 2, 'p', { tone: 'amber', len: 16, dir: 'up' });
  f.pointer(g1.nodes.b1.left + 15, g1.nodes.b1.bottom + 2, 'q', { tone: 'blue', len: 16, dir: 'up' });
  f.text(470, 196, '对齐后：p、q 到表尾都剩 5 个结点', { anchor: 'start', size: 12.5, bold: true, tone: 'violet' });
  // panel 2
  f.panel(10, 256, 700, 226, '② 同步后移，比较的是地址 p == q，而不是字符');
  const g2 = ylist(f, 84, 320, { tones: { s0: 'green' }, ghost: ['t1', 't2'] });
  const steps = [['t3', 'b1', '0'], ['t4', 'b2', '1']];
  steps.forEach(([a, b, k]) => {
    const na = g2.nodes[a], nb = g2.nodes[b];
    f.chip(na.left + 15, na.top - 13, `p${k}`, { tone: 'amber', size: 11, mono: true });
    f.chip(nb.left + 15, nb.bottom + 13, `q${k}`, { tone: 'blue', size: 11, mono: true });
  });
  const ni = g2.nodes.s0;
  f.pill(ni.left + 80, ni.top - 16, '第 2 步：p == q', 'green', { size: 11.5 });
  f.text(470, 456, '返回结点 i（公共后缀起点）', { anchor: 'start', size: 12.5, bold: true, tone: 'green' });
  f.save('2012-42-1');
}

/* ---------- 2013-41 主元素：投票抵消 + 验证 ---------- */
{
  const f = new Fig(740, 430);
  const A = [0, 5, 5, 3, 5, 7, 5, 5];
  const W = 52, X0 = 130;
  f.panel(10, 8, 720, 262, '第一趟：两两抵消不同的值，剩下的只可能是主元素');
  const y = 92;
  const a = f.array(X0, y, A, { w: W, h: 36, idx: true, idxPos: 'above', tones: (i) => (i >= 6 ? 'green' : undefined) });
  f.text(70, y + 18, 'A', { bold: true, size: 15 });
  // cancellation arcs (pairs)
  [[0, 1], [2, 3], [4, 5]].forEach(([i, j]) => {
    f.curve(a.cx(i), y - 22, a.cx(j), y - 22, -14, { tone: 'red', sw: 1.4 });
    f.text((a.cx(i) + a.cx(j)) / 2, y - 40, '抵消', { size: 11, tone: 'red' });
  });
  const cand = [0, 0, 5, 5, 5, 5, 5, 5];
  const cnt = [1, 0, 1, 0, 1, 0, 1, 2];
  f.text(70, 160, 'candidate', { size: 12, mono: true, subtle: true });
  f.text(70, 206, 'count', { size: 12, mono: true, subtle: true });
  cand.forEach((c, i) => f.chip(a.cx(i), 160, String(c), { mono: true, tone: c === 5 ? 'violet' : 'gray', size: 12 }));
  cnt.forEach((c, i) => {
    const base = 232;
    const h = c * 22;
    if (c) f.rect(a.cx(i) - 11, base - h, 22, h, { tone: c === 2 ? 'green' : 'violet', rx: 3, sw: 1.2 });
    else f.line(a.cx(i) - 11, base, a.cx(i) + 11, base, { tone: 'red', sw: 2 });
    f.text(a.cx(i), base + 12, String(c), { size: 11.5, mono: true, bold: true, tone: c ? undefined : 'red' });
  });
  f.text(82, 232, '（=0 时换候选）', { size: 10.5, muted: true });
  // verification
  f.panel(10, 282, 720, 140, '第二趟：必须验证真实次数 freq > n/2');
  const v1 = f.array(X0, 320, A, { w: W - 18, h: 30, tones: (i, v) => (v === 5 ? 'green' : undefined), size: 13 });
  f.text(v1.right + 18, 335, 'freq(5) = 5 > 8/2 = 4  ⇒  输出 5', { anchor: 'start', size: 13, bold: true, tone: 'green' });
  const B = [0, 5, 5, 3, 5, 1, 5, 7];
  const v2 = f.array(X0, 368, B, { w: W - 18, h: 30, tones: (i, v) => (v === 5 ? 'red' : undefined), size: 13 });
  f.text(v2.right + 18, 383, 'freq(5) = 4，4 > 4 不成立  ⇒  输出 −1', { anchor: 'start', size: 13, bold: true, tone: 'red' });
  f.text(70, 335, '例 1', { size: 12, subtle: true, bold: true });
  f.text(70, 383, '例 2', { size: 12, subtle: true, bold: true });
  f.save('2013-41-1');
}

/* ---------- 2015-41 按绝对值去重：标记表 + 摘链 ---------- */
{
  const f = new Fig(740, 408);
  f.panel(10, 8, 720, 214, '扫描链表：|data| 首次出现则保留并标记，再次出现则摘链删除');
  const vals = [21, -15, -15, -7, 15];
  const kept = [true, true, false, true, false];
  const items = [{ v: 'H', tone: 'gray' }, ...vals.map((v, i) => ({ v, tone: kept[i] ? 'green' : 'red', ghost: !kept[i] }))];
  const nodes = f.list(46, 58, items, { dw: 44, pw: 20, gap: 46, h: 32 });
  vals.forEach((v, i) => {
    const nd = nodes[i + 1];
    if (!kept[i]) {
      f.line(nd.left + 6, nd.top + 4, nd.right - 6, nd.bottom - 4, { tone: 'red', sw: 2 });
      f.text(nd.cx, nd.top - 12, '删除', { size: 11.5, tone: 'red', bold: true });
    } else f.text(nd.cx, nd.top - 12, '保留', { size: 11.5, tone: 'green', bold: true });
  });
  // seen array (sparse)
  const idx = ['0', '…', '7', '…', '15', '…', '21'];
  const marks = { 2: 3, 4: 1, 6: 0 }; // slot -> first node index
  const sa = f.array(190, 158, ['', '', '1', '', '1', '', '1'], { w: 50, h: 32, idx: true, idxLabels: idx, tones: { 2: 'violet', 4: 'violet', 6: 'violet' }, size: 14 });
  f.text(150, 174, 'seen', { mono: true, bold: true, size: 13 });
  [[0, 6], [1, 4], [2, 4], [3, 2], [4, 4]].forEach(([ni, slot]) => {
    const nd = nodes[ni + 1];
    f.line(nd.cx, nd.bottom + 3, sa.cx(slot), 155, { tone: kept[ni] ? 'violet' : 'red', sw: 1.1, dash: !kept[ni], arrow: 'end' });
  });
  // relink operation
  f.panel(10, 234, 720, 166, '删除时：pre 不动，只改 pre->link，然后 free(victim)');
  const n2 = f.list(110, 306, [{ v: -15, tone: 'green' }, { v: -15, tone: 'red', ghost: true }, { v: -7 }], { dw: 44, pw: 20, gap: 70, h: 32 });
  f.pointer(n2[0].cx, n2[0].top - 2, 'pre', { tone: 'green', len: 18 });
  f.pointer(n2[1].cx, n2[1].top - 2, 'cur', { tone: 'red', len: 18 });
  f.path(`M${n2[0].dot} ${n2[0].bottom}C${n2[0].dot + 10} ${n2[0].bottom + 46} ${n2[2].left - 30} ${n2[2].bottom + 46} ${n2[2].left + 18} ${n2[2].bottom + 3}`, { tone: 'green', arrow: 'end', sw: 2 });
  f.text((n2[0].dot + n2[2].left) / 2 + 10, n2[0].bottom + 46, 'pre->link = cur->link', { size: 12, mono: true, tone: 'green', bold: true });
  f.text(560, 312, 'cur = pre->link', { size: 12.5, mono: true, anchor: 'start', subtle: true });
  f.text(560, 334, 'free(victim)', { size: 12.5, mono: true, anchor: 'start', subtle: true });
  f.text(560, 362, '连续重复也能删净', { size: 12, anchor: 'start', tone: 'violet', bold: true });
  f.save('2015-41-1');
}

/* ---------- 2018-41 未出现的最小正整数 ---------- */
{
  const f = new Fig(720, 410);
  const ex = [
    { y: 14, A: [-5, 3, 2, 3], seen: [0, 1, 1, 0], ans: 1, title: '例 1：A = {−5, 3, 2, 3}，n = 4' },
    { y: 214, A: [1, 2, 3], seen: [1, 1, 1], ans: 4, title: '例 2：A = {1, 2, 3}，n = 3' },
  ];
  for (const e of ex) {
    f.panel(10, e.y, 700, 186, e.title);
    const n = e.A.length;
    const a = f.array(120, e.y + 52, e.A, { w: 48, h: 34, tones: (i, v) => (v >= 1 && v <= n ? 'blue' : 'gray'), idx: true, idxPos: 'above' });
    f.text(80, e.y + 69, 'A', { bold: true, size: 15 });
    const firstZero = e.seen.indexOf(0);
    const s = f.array(120, e.y + 118, e.seen, { w: 48, h: 34, tones: (i, v) => (i === firstZero ? 'green' : v ? 'violet' : undefined), idx: 1, idxLabels: e.seen.map((_, i) => `x=${i + 1}`) });
    f.text(80, e.y + 135, 'seen', { mono: true, bold: true, size: 13 });
    e.A.forEach((v, i) => {
      if (v >= 1 && v <= n) f.line(a.cx(i), e.y + 88, s.cx(v - 1), e.y + 115, { tone: 'blue', arrow: 'end', sw: 1.2 });
      else f.text(a.cx(i), e.y + 102, '越界，忽略', { size: 11, muted: true });
    });
    const tx = 120 + 5 * 48 + 40;
    if (firstZero >= 0) {
      f.text(tx, e.y + 120, `第一个 0 在 seen[${firstZero}]`, { anchor: 'start', size: 13, subtle: true });
      f.text(tx, e.y + 144, `⇒ 答案 ${firstZero} + 1 = ${e.ans}`, { anchor: 'start', size: 15, bold: true, tone: 'green' });
    } else {
      f.text(tx, e.y + 120, '1 ~ n 全部出现', { anchor: 'start', size: 13, subtle: true });
      f.text(tx, e.y + 144, `⇒ 答案 n + 1 = ${e.ans}`, { anchor: 'start', size: 15, bold: true, tone: 'green' });
    }
    f.text(tx, e.y + 70, '只有 1 ≤ A[i] ≤ n 才写入 seen[A[i]−1]', { anchor: 'start', size: 12, subtle: true });
  }
  f.save('2018-41-1');
}

/* ---------- 2019-41 链表重排：找中点 → 逆置后半 → 交织 ---------- */
{
  const f = new Fig(740, 500);
  const L = ['a₁', 'a₂', 'a₃', 'a₄', 'a₅', 'a₆', 'a₇'];
  const DW = 34, PW = 16, GAP = 22;
  f.panel(10, 8, 720, 138, '① 快慢指针：slow 每次 1 步、fast 每次 2 步；slow 停在前半段末尾');
  const n1 = f.list(110, 74, [{ v: 'H', tone: 'gray' }, ...L.map((v, i) => ({ v, tone: i < 4 ? 'blue' : 'amber' }))], { dw: DW, pw: PW, gap: GAP, h: 30 });
  f.pointer(n1[4].left + DW / 2, n1[4].top - 2, 'slow', { tone: 'blue', len: 16 });
  f.pointer(n1[7].left + DW / 2, n1[7].top - 2, 'fast', { tone: 'amber', len: 16 });
  f.brace(n1[1].left, n1[4].right, 118, '前半 ⌈n/2⌉ = 4', { tone: 'blue' });
  f.brace(n1[5].left, n1[7].right, 118, '后半 ⌊n/2⌋ = 3', { tone: 'amber' });

  f.panel(10, 152, 720, 136, '② 断开 slow->next = NULL，原地逆置后半段（三指针 prev / cur / next）');
  const n2a = f.list(110, 194, [{ v: 'H', tone: 'gray' }, ...L.slice(0, 4).map((v) => ({ v, tone: 'blue' }))], { dw: DW, pw: PW, gap: GAP, h: 30 });
  f.text(n2a[4].right + 20, 209, 'first 链', { anchor: 'start', size: 12, tone: 'blue', bold: true });
  const n2b = f.list(110 + 72, 240, ['a₇', 'a₆', 'a₅'].map((v) => ({ v, tone: 'amber' })), { dw: DW, pw: PW, gap: GAP, h: 30 });
  f.text(n2b[2].right + 20, 255, 'second 链（已逆置）', { anchor: 'start', size: 12, tone: 'amber', bold: true });
  f.text(560, 206, '原先 a₅→a₆→a₇', { anchor: 'start', size: 12, subtle: true });
  f.text(560, 228, '变为 a₇→a₆→a₅', { anchor: 'start', size: 12, subtle: true });

  f.panel(10, 300, 720, 192, '③ 交替合并：每轮先保存两个后继，再 first->next = second，second->next = next1');
  const order = ['a₁', 'a₇', 'a₂', 'a₆', 'a₃', 'a₅', 'a₄'];
  const n3 = f.list(110, 374, [{ v: 'H', tone: 'gray' }, ...order.map((v) => ({ v, tone: ['a₇', 'a₆', 'a₅'].includes(v) ? 'amber' : 'blue' }))], { dw: DW, pw: PW, gap: GAP, h: 30 });
  for (let k = 0; k < 3; k += 1) {
    const i = 1 + 2 * k;
    f.text((n3[i].cx + n3[i + 1].cx) / 2, 350, `第 ${k + 1} 轮`, { size: 11.5, tone: 'violet', bold: true });
    f.brace(n3[i].left, n3[i + 1].right, 362, '', { tone: 'violet', dir: 'up', h: 5 });
  }
  f.text(n3[7].cx, 350, '中点留尾', { size: 11.5, subtle: true });
  f.text(110, 434, '结果：L′ = (a₁, aₙ, a₂, aₙ₋₁, a₃, aₙ₋₂, …)；只改 next，不搬数据，不新建结点。', { anchor: 'start', size: 12.5, subtle: true });
  f.legend(110, 466, [{ tone: 'blue', label: '前半段结点' }, { tone: 'amber', label: '后半段结点（逆置后从头取）' }]);
  f.save('2019-41-1');
}

/* ---------- 2020-41 三元组最小距离：数轴 + 推进最小者 ---------- */
{
  const f = new Fig(740, 556);
  // concept
  f.panel(10, 8, 720, 132, '把距离化成极差：D = |a−b| + |b−c| + |c−a| = 2·(max − min)');
  const lx = (v) => 80 + (v + 2) * 28; // values in [-2, 12]
  f.line(60, 92, 520, 92, { arrow: 'end' });
  const pts = [{ v: 1, l: 'x = min', tone: 'blue' }, { v: 6, l: 'y', tone: 'amber' }, { v: 13 - 2, l: 'z = max', tone: 'green' }];
  f.curve(lx(1), 84, lx(6), 84, -26, { tone: 'violet', sw: 1.4 });
  f.curve(lx(6), 84, lx(11), 84, -26, { tone: 'violet', sw: 1.4 });
  f.curve(lx(1), 100, lx(11), 100, 26, { tone: 'violet', sw: 1.4 });
  f.text((lx(1) + lx(6)) / 2, 58, 'y − x', { size: 12, tone: 'violet' });
  f.text((lx(6) + lx(11)) / 2, 58, 'z − y', { size: 12, tone: 'violet' });
  f.text((lx(1) + lx(11)) / 2, 128, 'z − x', { size: 12, tone: 'violet' });
  pts.forEach((p) => { f.circle(lx(p.v), 92, 6, { tone: p.tone, sw: 2 }); f.text(lx(p.v), 70 + (p.v === 6 ? 0 : 0) - 0, '', {}); f.text(lx(p.v) + (p.v === 1 ? -6 : p.v === 11 ? 6 : 0), 112, p.l, { size: 12, bold: true, tone: p.tone, anchor: p.v === 1 ? 'end' : p.v === 11 ? 'start' : 'middle' }); });
  f.text(560, 74, '(y−x)+(z−y)+(z−x)', { anchor: 'start', size: 12.5, mono: true });
  f.text(560, 98, '= 2(z − x)', { anchor: 'start', size: 15, bold: true, tone: 'violet', mono: true });
  f.text(560, 120, '中间值不影响 D', { anchor: 'start', size: 12, subtle: true });

  // trace
  f.panel(10, 152, 720, 396, '每轮记录 D，然后只推进当前最小值所在数组的指针');
  const sx = (v) => 96 + (v + 26) * 9.6; // [-26, 12]
  const trace = [
    [-1, -25, 2, 'S₂'], [-1, -10, 2, 'S₂'], [-1, 10, 2, 'S₁'], [0, 10, 2, 'S₁'], [9, 10, 2, 'S₃'], [9, 10, 9, ''],
  ];
  const ty = 214;
  trace.forEach(([a, b, c, nxt], k) => {
    const y = ty + k * 46;
    f.line(sx(-26), y, sx(12), y, { cls: 'faint', sw: 1 });
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
    const best = k === 5;
    f.raw(`<rect x="${sx(lo)}" y="${y - 5}" width="${Math.max(2, sx(hi) - sx(lo))}" height="10" rx="5" class="${best ? 'f-green s-green' : 'f-violet s-violet'}" stroke-width="1"/>`);
    [[a, 'blue', -15], [b, 'amber', 15], [c, 'teal', -15]].forEach(([v, tone, dy], j) => {
      f.circle(sx(v), y, 6.5, { tone, sw: 2 });
      const dx = j === 2 && Math.abs(c - a) < 3 ? 12 : j === 0 && Math.abs(c - a) < 3 ? -8 : 0;
      f.text(sx(v) + dx, y + dy, `${v}`, { size: 11, mono: true, bold: true, tone });
    });
    const D = 2 * (hi - lo);
    f.text(500, y, `(${a}, ${b}, ${c})`, { anchor: 'start', size: 12.5, mono: true });
    f.text(610, y, `D = ${D}`, { anchor: 'start', size: 13, mono: true, bold: true, tone: best ? 'green' : undefined });
    if (nxt) f.text(676, y, `推 ${nxt}`, { anchor: 'start', size: 12, tone: 'red', bold: true });
  });
  const axY = ty + 6 * 46 - 10;
  f.line(sx(-26), axY, sx(12), axY, { arrow: 'end', sw: 1.2 });
  [-25, -10, 0, 10].forEach((v) => { f.line(sx(v), axY - 4, sx(v), axY + 4, { sw: 1.2 }); f.text(sx(v), axY + 14, String(v), { size: 10.5, muted: true, mono: true }); });
  f.legend(96, 532, [{ tone: 'blue', label: 'a ∈ S₁' }, { tone: 'amber', label: 'b ∈ S₂' }, { tone: 'teal', label: 'c ∈ S₃' }, { tone: 'violet', label: '极差 max − min' }]);
  f.save('2020-41-1');
}

/* ---------- 2025-41 后缀最大/最小值：逆序扫描 ---------- */
{
  const f = new Fig(740, 400);
  const A = [1, 4, -9, 6];
  const rows = [
    { i: 3, hi: 6, lo: 6, a: 36, b: 36, res: 36 },
    { i: 2, hi: 6, lo: -9, a: -54, b: 81, res: 81 },
    { i: 1, hi: 6, lo: -9, a: 24, b: -36, res: 24 },
    { i: 0, hi: 6, lo: -9, a: 6, b: -9, res: 6 },
  ];
  f.panel(10, 8, 470, 384, '从右往左：先把 A[i] 并入后缀，再算 res[i]');
  const W = 46, X0 = 70;
  rows.forEach((r, k) => {
    const y = 62 + k * 82;
    const a = f.array(X0, y, A, { w: W, h: 32, ghost: A.map((_, j) => j).filter((j) => j < r.i), tones: (j) => (j === r.i ? 'blue' : j > r.i ? 'gray' : undefined), size: 14, idx: k === 0 ? true : false, idxPos: 'above' });
    f.text(32, y + 16, `i=${r.i}`, { mono: true, bold: true, size: 12.5 });
    f.brace(a.x(r.i), a.right, y + 40, '合法后缀 A[i..n−1]', { tone: 'gray', size: 11 });
    const tx = a.right + 18;
    f.chip(tx + 34, y + 6, `hi=${r.hi}`, { tone: 'green', mono: true, size: 11.5 });
    f.chip(tx + 34, y + 30, `lo=${r.lo}`, { tone: 'red', mono: true, size: 11.5 });
    const pick = r.a >= r.b ? 'a' : 'b';
    f.text(tx + 82, y + 6, `${A[r.i]}×${r.hi} = ${r.a}`, { anchor: 'start', size: 12, mono: true, bold: pick === 'a', tone: pick === 'a' ? 'green' : undefined, muted: pick !== 'a' });
    f.text(tx + 82, y + 30, `${A[r.i]}×${r.lo} = ${r.b}`, { anchor: 'start', size: 12, mono: true, bold: pick === 'b', tone: pick === 'b' ? 'red' : undefined, muted: pick !== 'b' });
    f.text(tx + 82, y + 52, `res[${r.i}] = ${r.res}`, { anchor: 'start', size: 12.5, mono: true, bold: true, tone: 'blue' });
  });
  // linear-function inset
  f.panel(494, 8, 236, 384, '为什么只看 hi 和 lo？');
  const ox = 520, oy = 210, ww = 186, hh = 150;
  const yv = (v) => oy - v * 0.9;
  const xv = (t) => ox + (t + 9) / 15 * ww; // y in [-9, 6]
  f.line(ox, yv(0), ox + ww + 6, yv(0), { arrow: 'end', sw: 1.2 });
  f.text(ox + ww + 6, yv(0) + 14, 'y', { size: 12, italic: true, anchor: 'end' });
  f.line(xv(-9), yv(-60), xv(-9), yv(85), { cls: 'faint', dash: true, sw: 1 });
  f.line(xv(6), yv(-60), xv(6), yv(85), { cls: 'faint', dash: true, sw: 1 });
  f.text(xv(-9), yv(-60) + 12, 'lo=−9', { size: 11, mono: true, tone: 'red' });
  f.text(xv(6), yv(-60) + 12, 'hi=6', { size: 11, mono: true, tone: 'green' });
  f.line(xv(-9), yv(4 * -9), xv(6), yv(4 * 6), { tone: 'blue', sw: 2.2 });
  f.line(xv(-9), yv(-9 * -9), xv(6), yv(-9 * 6), { tone: 'amber', sw: 2.2 });
  f.circle(xv(6), yv(24), 5, { tone: 'blue', sw: 2 });
  f.circle(xv(-9), yv(81), 5, { tone: 'amber', sw: 2 });
  f.text(xv(6) - 6, yv(24) - 14, 'x=4：max 在 hi', { size: 11, anchor: 'end', tone: 'blue', bold: true });
  f.text(xv(-9) + 8, yv(81) - 10, 'x=−9：max 在 lo', { size: 11, anchor: 'start', tone: 'amber', bold: true });
  f.text(612, 300, 'x·y 是 y 的一次函数，', { size: 12, subtle: true });
  f.text(612, 320, '区间上的最大值必在端点', { size: 12, subtle: true });
  f.text(612, 352, 'res[i] = max(x·hi, x·lo)', { size: 12.5, mono: true, bold: true, tone: 'violet' });
  f.save('2025-41-1');
}
