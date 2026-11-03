// 第 3 章 栈、队列和数组 / 第 4 章 树与二叉树：真题解析配图。
import { Fig, textWidth } from './lib.mjs';

/* ---------- 2019-42 循环链式队列 ---------- */
function ring(f, cx, cy, R, items, o = {}) {
  // items: [{ label, tone, ghost, dash }] placed clockwise from the top
  const k = items.length;
  const pts = items.map((_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / k;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a), a];
  });
  const r = o.r ?? 21;
  for (let i = 0; i < k; i += 1) {
    const [x1, y1, a1] = pts[i];
    const [x2, y2, a2] = pts[(i + 1) % k];
    const d = (2 * Math.PI) / k;
    const s1 = a1 + (r / R) * 1.05;
    const s2 = a1 + d - (r / R) * 1.15;
    const p1 = [cx + R * Math.cos(s1), cy + R * Math.sin(s1)];
    const p2 = [cx + R * Math.cos(s2), cy + R * Math.sin(s2)];
    const tone = items[(i + 1) % k].inTone;
    f.path(`M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}A${R} ${R} 0 0 1 ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`, { arrow: 'end', tone, sw: tone ? 2 : 1.4, dash: items[(i + 1) % k].inDash });
  }
  items.forEach((it, i) => {
    const [x, y] = pts[i];
    f.node(x, y, it.label, { r, tone: it.tone, dash: it.dash, size: 13 });
  });
  return pts;
}
{
  const f = new Fig(740, 300);
  f.panel(10, 8, 230, 284, '① 初始：一个结点自成环');
  f.node(125, 150, 'N₀', { r: 24, tone: 'gray' });
  f.path('M 145 136 C 200 100, 200 200, 145 164', { arrow: 'end', sw: 1.6 });
  f.pointer(112, 124, 'front', { tone: 'blue', len: 24 });
  f.pointer(112, 176, 'rear', { tone: 'amber', len: 24, dir: 'up' });
  f.text(125, 250, 'front == rear ⇒ 队空', { size: 12.5, bold: true, tone: 'violet' });
  f.text(125, 272, 'rear->next == front ⇒ 需扩容', { size: 11.5, subtle: true });

  f.panel(250, 8, 480, 284, '② 第一个元素 x 入队：先在 rear 后插入 N₁，再写入旧 rear');
  const a = { x: 360, y: 140 }, b = { x: 600, y: 140 };
  f.rect(a.x - 46, a.y - 22, 92, 44, { tone: 'blue', rx: 8 });
  f.text(a.x - 14, a.y, 'x', { bold: true, tone: 'blue', size: 16, italic: true });
  f.line(a.x + 14, a.y - 22, a.x + 14, a.y + 22, { tone: 'blue', sw: 1.2 });
  f.rect(b.x - 46, b.y - 22, 92, 44, { tone: 'green', rx: 8, dash: true });
  f.text(b.x - 14, b.y, '空', { tone: 'green', size: 13 });
  f.line(b.x + 14, b.y - 22, b.x + 14, b.y + 22, { tone: 'green', sw: 1.2, dash: true });
  f.line(a.x + 30, a.y, b.x - 48, b.y, { arrow: 'end', sw: 1.6 });
  f.path(`M${b.x + 30} ${b.y} L${b.x + 70} ${b.y} L${b.x + 70} ${b.y + 70} L${a.x - 70} ${a.y + 70} L${a.x - 70} ${a.y} L${a.x - 48} ${a.y}`, { arrow: 'end', sw: 1.6 });
  f.text(a.x, a.y + 38, 'N₀', { size: 12, subtle: true, bold: true });
  f.text(b.x, b.y + 38, 'N₁（新申请）', { size: 12, tone: 'green', bold: true });
  f.pointer(a.x, a.y - 24, 'front', { tone: 'blue', len: 26 });
  f.pointer(b.x, b.y - 24, 'rear', { tone: 'amber', len: 26 });
  f.text(490, 252, '有效元素：front 起到 rear 之前；rear 永远指向一个空闲结点', { size: 12, subtle: true });
  f.save('2019-42-1');
}
{
  const f = new Fig(740, 360);
  f.panel(10, 8, 350, 344, '③ 一般状态：数据区 + 空闲区');
  const items = [
    { label: '12', tone: 'blue' }, { label: '7', tone: 'blue' }, { label: '9', tone: 'blue' },
    { label: '空', tone: 'gray' }, { label: '空', tone: 'gray' }, { label: '空', tone: 'gray' },
  ];
  const pts = ring(f, 185, 168, 82, items);
  f.text(pts[0][0], pts[0][1] - 33, 'front', { size: 12.5, bold: true, tone: 'blue', mono: true });
  f.text(pts[3][0], pts[3][1] + 34, 'rear', { size: 12.5, bold: true, tone: 'amber', mono: true });
  f.text(185, 300, '出队：输出 front->data，front 后移（不释放）', { size: 11.5, subtle: true });
  f.text(185, 322, '入队：写入 rear 所指空结点，rear 后移', { size: 11.5, subtle: true });

  f.panel(370, 8, 360, 344, '④ rear->next == front：在 rear 后插入新结点');
  const it2 = [
    { label: '12', tone: 'blue' }, { label: '7', tone: 'blue' }, { label: '9', tone: 'blue' },
    { label: '4', tone: 'blue' }, { label: '空', tone: 'gray' }, { label: '新', tone: 'green', dash: true, inTone: 'green', inDash: true },
  ];
  it2[0].inTone = 'green';
  it2[0].inDash = true;
  const p2 = ring(f, 550, 168, 82, it2);
  f.text(p2[0][0], p2[0][1] - 33, 'front', { size: 12.5, bold: true, tone: 'blue', mono: true });
  f.text(p2[4][0] - 8, p2[4][1] + 34, 'rear', { size: 12.5, bold: true, tone: 'amber', mono: true });
  f.text(550, 300, '只剩 rear 一个空结点时先扩容，再写入', { size: 11.5, subtle: true });
  f.text(550, 322, '空间只增不减；入队、出队都只改常数个指针', { size: 11.5, subtle: true });
  f.save('2019-42-2');
}

/* ---------- 2026-42 出栈序列 ---------- */
function stackCol(f, x, y, stack, o = {}) {
  // draws a vertical stack (bottom first) with base line at y
  const w = o.w ?? 38, h = o.h ?? 26;
  f.path(`M${x - w / 2 - 4} ${y - (o.cap ?? 4) * h - 6}L${x - w / 2 - 4} ${y + 2}L${x + w / 2 + 4} ${y + 2}L${x + w / 2 + 4} ${y - (o.cap ?? 4) * h - 6}`, { sw: 1.4 });
  stack.forEach((v, i) => {
    const tone = o.tones?.[v];
    f.rect(x - w / 2, y - (i + 1) * h + 1, w, h - 2, { tone, rx: 4 });
    f.text(x, y - (i + 0.5) * h, String(v), { mono: true, bold: true, tone, size: 13 });
  });
}
{
  const f = new Fig(760, 470);
  f.panel(10, 8, 740, 220, '序列 ①  2, 3, 1, 6, 4, 7, 5, 9, 8：按目标依次「压到目标再弹出」');
  const s1 = [
    { t: 2, ops: 'push 1,2 · pop', st: [1] },
    { t: 3, ops: 'push 3 · pop', st: [1] },
    { t: 1, ops: 'pop', st: [] },
    { t: 6, ops: 'push 4,5,6 · pop', st: [4, 5] },
    { t: 4, ops: '4 不在栈顶！', st: [4, 5], fail: true },
  ];
  s1.forEach((c, i) => {
    const x = 80 + i * 124;
    f.chip(x, 56, `输出 ${c.t}`, { tone: c.fail ? 'red' : 'blue', size: 12 });
    stackCol(f, x, 176, c.st, { tones: c.fail ? { 5: 'red', 4: 'amber' } : {}, cap: 3 });
    f.text(x, 196, c.ops, { size: 11.5, mono: !c.fail, tone: c.fail ? 'red' : undefined, bold: !!c.fail, subtle: !c.fail });
    if (i < s1.length - 1) f.line(x + 46, 130, x + 94, 130, { arrow: 'end', cls: 'faint' });
  });
  f.text(620, 112, '5 压在 4 上面，', { size: 12, anchor: 'start', tone: 'red' });
  f.text(620, 132, '无法先弹出 4', { size: 12, anchor: 'start', tone: 'red' });
  f.text(620, 162, '⇒ 不合法', { size: 14, anchor: 'start', tone: 'red', bold: true });

  f.panel(10, 240, 740, 222, '序列 ②  2, 3, 1, 5, 6, 7, 4, 9, 8：每个目标都能成为栈顶');
  const s2 = [
    [2, [1]], [3, [1]], [1, []], [5, [4]], [6, [4]], [7, [4]], [4, []], [9, [8]], [8, []],
  ];
  s2.forEach(([t, st], i) => {
    const x = 50 + i * 74;
    f.chip(x, 288, `${t}`, { tone: 'green', size: 12, mono: true });
    stackCol(f, x, 400, st, { w: 32, h: 24, cap: 3 });
    if (i < s2.length - 1) f.line(x + 24, 350, x + 50, 350, { arrow: 'end', cls: 'faint' });
  });
  f.text(50 - 30, 432, '每列是「输出该元素后」的栈；9 个元素各入栈、出栈一次，全部吻合 ⇒ 合法', { size: 12, anchor: 'start', tone: 'green', bold: true });
  f.save('2026-42-1');
}
{
  const f = new Fig(740, 260);
  f.panel(10, 8, 350, 244, '312 禁形：先最大、再最小、后居中');
  const bars = [{ l: 'Pᵢ', v: 3, tone: 'red' }, { l: 'Pⱼ', v: 1, tone: 'blue' }, { l: 'Pₖ', v: 2, tone: 'amber' }];
  bars.forEach((b, i) => {
    const x = 70 + i * 90, base = 200;
    f.rect(x - 22, base - b.v * 44, 44, b.v * 44, { tone: b.tone, rx: 5 });
    f.text(x, base + 16, b.l, { bold: true, tone: b.tone });
    f.text(x, base - b.v * 44 - 12, ['大', '小', '中'][i], { size: 12, tone: b.tone, bold: true });
  });
  f.text(185, 232, '出栈先后：i < j < k；数值：Pⱼ < Pₖ < Pᵢ', { size: 12, subtle: true });

  f.panel(370, 8, 360, 244, '为什么不可能？');
  stackCol(f, 450, 200, ['b', 'c'], { tones: { b: 'blue', c: 'amber' }, cap: 3, w: 44, h: 32 });
  f.text(450, 222, '弹出 a 之后的栈', { size: 11.5, subtle: true });
  f.text(510, 70, '① 要先弹出最大的 a，', { size: 12, anchor: 'start' });
  f.text(510, 90, '   比它小的 b、c 都已入栈', { size: 12, anchor: 'start' });
  f.text(510, 116, '② b < c，所以 b 先入栈、', { size: 12, anchor: 'start' });
  f.text(510, 136, '   在 c 的下面', { size: 12, anchor: 'start' });
  f.text(510, 162, '③ 下一个要 b，但 c 挡在上面', { size: 12, anchor: 'start', tone: 'red', bold: true });
  f.text(510, 188, '   ⇒ 序列不可能由栈得到', { size: 12, anchor: 'start', tone: 'red', bold: true });
  f.save('2026-42-2');
}
{
  const f = new Fig(720, 326);
  const T = (label, children, extra = {}) => ({ label, children, shape: 'box', bw: textWidth(label, 12.5) + 22, size: 12.5, mono: false, ...extra });
  const L = (label) => ({ label, shape: 'box', tone: 'green', bw: 54, size: 13 });
  const spec = T('输出 2，栈 [1]', [
    T('出 1，栈 []', [L('2134'), L('2143')], { tone: 'blue' }),
    T('出 3，栈 [1]', [L('2314'), L('2341')], { tone: 'blue' }),
    T('出 4，栈 [1,3]', [L('2431')], { tone: 'blue' }),
  ], { tone: 'violet' });
  f.text(360, 22, '强制前缀：push 1, push 2, pop 2；之后按第二个输出分类', { size: 12.5, bold: true, subtle: true });
  f.tree(spec, { x: 120, y: 70, dx: 108, dy: 96 });
  f.text(360, 300, '共 5 种。2413 不合法：弹出 4 后栈顶是 3，不能越过 3 先弹 1', { size: 12.5, tone: 'red' });
  f.save('2026-42-3');
}

/* ---------- 2012-41 最佳归并树（哈夫曼） ---------- */
{
  const f = new Fig(740, 430);
  const circ = ['①', '②', '③', '④', '⑤'];
  const I = (v, step, children) => ({ label: String(v), shape: 'box', bw: 50, tone: 'violet', children, note: `${circ[step - 1]} ${v - 1} 次`, noteDy: -25, noteTone: 'violet' });
  const Lf = (v, name) => ({ label: String(v), r: 20, tone: 'blue', note: name, noteDy: 33 });
  const spec = I(395, 5, [I(195, 4, [I(85, 2, [I(45, 1, [Lf(10, 'A'), Lf(35, 'B')]), Lf(40, 'C')]), I(110, 3, [Lf(50, 'D'), Lf(60, 'E')])]), Lf(200, 'F')]);
  f.tree(spec, { x: 120, y: 56, dx: 76, dy: 76 });
  ['深度 0', '深度 1', '深度 2', '深度 3', '深度 4'].forEach((s2, i) => f.text(42, 56 + i * 76, s2, { size: 11.5, muted: true }));
  f.panel(540, 40, 190, 300, '');
  const lines = [
    ['写入总量 WPL', ''],
    ['= 200×1', ''],
    ['+ (40+50+60)×3', ''],
    ['+ (10+35)×4', ''],
    ['= 830', 'violet'],
    ['', ''],
    ['最坏比较次数', ''],
    ['= 830 − (6−1)', ''],
    ['= 44+84+109', ''],
    ['  +194+394', ''],
    ['= 825', 'green'],
  ];
  lines.forEach(([s2, tone], i) => f.text(556, 64 + i * 25, s2, { anchor: 'start', size: 12.5, mono: i !== 0 && i !== 6, bold: !!tone || i === 0 || i === 6, tone }));
  f.legend(120, 414, [{ tone: 'blue', label: '原始表（叶，权 = 表长）' }, { tone: 'violet', label: '第 k 次归并，标注最坏比较次数 x+y−1' }]);
  f.save('2012-41-1');
}

/* ---------- 2014-41 WPL：叶子权值 × 深度 ---------- */
{
  const f = new Fig(720, 334);
  for (let d = 0; d <= 3; d += 1) {
    f.raw(`<rect x="20" y="${30 + d * 74}" width="440" height="66" rx="8" class="panel" stroke-width="0.8"/>`);
    f.text(46, 56 + d * 74, `d = ${d}`, { size: 12, mono: true, subtle: true, bold: true });
  }
  const Lf = (name, w, d) => ({ label: `${name}`, tone: 'green', note: `w=${w}  ${w}×${d}`, noteDy: 30, noteTone: 'green', noteMono: true, size: 13 });
  const In = (name, children) => ({ label: name, children, size: 13 });
  const spec = In('R', [Lf('A', 2, 1), In('B', [Lf('C', 3, 2), In('E', [Lf('D', 5, 3), Lf('F', 1, 3)])])]);
  f.tree(spec, { x: 140, y: 56, dx: 84, dy: 74 });
  f.panel(476, 34, 234, 278, '递归 F(p, d)');
  const L = [
    ['p 为空 → 0', 'gray'],
    ['p 为叶 → w(p)·d', 'green'],
    ['否则 → F(左, d+1)', 'blue'],
    ['        + F(右, d+1)', 'blue'],
  ];
  L.forEach(([s, tone], i) => f.text(492, 72 + i * 26, s, { anchor: 'start', mono: true, size: 12.5, tone }));
  f.text(492, 196, 'WPL = F(root, 0)', { anchor: 'start', mono: true, size: 13, bold: true, tone: 'violet' });
  f.text(492, 230, '= 2 + 6 + 15 + 3', { anchor: 'start', mono: true, size: 13 });
  f.text(492, 256, '= 26', { anchor: 'start', mono: true, size: 15, bold: true, tone: 'green' });
  f.text(492, 290, '只有绿色叶子参与求和', { anchor: 'start', size: 12, subtle: true });
  f.save('2014-41-1');
}

/* ---------- 2016-42 正则 k 叉树 ---------- */
{
  const f = new Fig(740, 330);
  f.panel(10, 8, 250, 314, '边数两种数法（k = 3，m = 3）');
  const leaf = () => ({ label: '', r: 9, tone: 'green' });
  const inn = (children) => ({ label: '', r: 11, tone: 'violet', children });
  f.tree(inn([inn([leaf(), leaf(), leaf()]), leaf(), inn([leaf(), leaf(), leaf()])]), { x: 34, y: 66, dx: 30, dy: 70 });
  f.text(135, 236, '每个非叶结点发出 k 条边', { size: 12, subtle: true });
  f.text(135, 260, 'e = km = 9', { size: 13, mono: true, bold: true, tone: 'violet' });
  f.text(135, 282, 'e = n − 1 = m + n₀ − 1', { size: 13, mono: true, bold: true, tone: 'blue' });
  f.text(135, 306, '⇒ n₀ = (k−1)m + 1 = 7', { size: 13, mono: true, bold: true, tone: 'green' });

  f.panel(270, 8, 290, 314, '高度 h = 3 时结点最多：每层填满');
  const full = (d) => (d === 2 ? leaf() : inn([full(d + 1), full(d + 1), full(d + 1)]));
  f.tree(full(0), { x: 290, y: 66, dx: 31, dy: 74 });
  f.text(415, 280, '1 + k + k² = 13', { size: 13, mono: true, bold: true, tone: 'violet' });
  f.text(415, 304, 'n_{max} = (k^{h} − 1)/(k − 1)', { size: 12.5, mono: true, bold: true });

  f.panel(570, 8, 160, 314, '结点最少：一条链生长');
  f.tree(inn([leaf(), leaf(), inn([leaf(), leaf(), leaf()])]), { x: 592, y: 66, dx: 26, dy: 74 });
  f.text(650, 280, '1 + k(h−1) = 7', { size: 13, mono: true, bold: true, tone: 'violet' });
  f.text(650, 304, '每展开一次 +k', { size: 12, subtle: true });
  f.save('2016-42-1');
}

/* ---------- 2017-41 表达式树 → 中缀表达式 ---------- */
function exprFigure(f, ox, spec, outParts, title) {
  f.text(ox + 160, 24, title, { size: 13, bold: true, subtle: true });
  const t = f.tree(spec, { x: ox + 62, y: 66, dx: 60, dy: 66 });
  // hulls around non-root internal subtrees
  const boxes = [];
  const walk = (nd, depth) => {
    if (!nd) return [Infinity, -Infinity, Infinity, -Infinity];
    let [x1, x2, y1, y2] = [nd.x, nd.x, nd.y, nd.y];
    for (const k of nd.kids) {
      const [a, b, c, d] = walk(k, depth + 1);
      x1 = Math.min(x1, a); x2 = Math.max(x2, b); y1 = Math.min(y1, c); y2 = Math.max(y2, d);
    }
    if (depth > 0 && nd.kids.some(Boolean) && nd.hull) boxes.push({ x1, x2, y1, y2, tone: nd.hull, depth });
    return [x1, x2, y1, y2];
  };
  walk(t.root, 0);
  for (const b of boxes) {
    const pad = 27 - (b.depth - 1) * 6;
    f.rect(b.x1 - pad, b.y1 - pad, b.x2 - b.x1 + 2 * pad, b.y2 - b.y1 + 2 * pad, { tone: b.tone, fill: false, rx: 16, dash: true, sw: 1.4 });
  }
  // output string with coloured parentheses
  const size = 18, cw = size * 0.6;
  const total = outParts.reduce((a, p) => a + p[0].length, 0);
  let x = ox + 160 - (total * cw) / 2;
  for (const [s, tone] of outParts) {
    for (const ch of s) {
      f.text(x + cw / 2, 336, ch, { mono: true, size, bold: !!tone, tone });
      x += cw;
    }
  }
  return t;
}
{
  const f = new Fig(740, 400);
  const L = (s) => ({ label: s, size: 14 });
  const N = (s, children, hull) => ({ label: s, children, hull, tone: hull });
  exprFigure(f, 10, N('*', [N('+', [L('a'), L('b')], 'blue'), N('*', [L('c'), N('−', [null, L('d')], 'amber')], 'green')]),
    [['(', 'blue'], ['a+b', ''], [')', 'blue'], ['*', ''], ['(', 'green'], ['c*', ''], ['(', 'amber'], ['−d', ''], [')', 'amber'], [')', 'green']], '树 1');
  exprFigure(f, 380, N('+', [N('*', [L('a'), L('b')], 'blue'), N('−', [null, N('−', [L('c'), L('d')], 'amber')], 'green')]),
    [['(', 'blue'], ['a*b', ''], [')', 'blue'], ['+', ''], ['(', 'green'], ['−', ''], ['(', 'amber'], ['c−d', ''], [')', 'amber'], [')', 'green']], '树 2');
  f.line(370, 40, 370, 350, { cls: 'faint', dash: true, sw: 1 });
  f.text(370, 382, '每个「非根、非叶」结点 ⇔ 输出中一对同色括号；根和叶子不加括号', { size: 12.5, subtle: true });
  f.save('2017-41-1');
}

/* ---------- 2020-42 前缀编码与二叉 Trie ---------- */
const lab = (nd, b) => ({ ...nd, edgeLabel: b });
{
  const f = new Fig(740, 350);
  f.panel(10, 8, 300, 334, 'A=0  B=10  C=110  D=111');
  const leaf = (c, tone) => ({ label: c, tone, size: 14 });
  const spec = { label: '根', r: 18, size: 12, children: [lab(leaf('A', 'blue'), '0'), lab({ label: '', shape: 'dot', children: [lab(leaf('B', 'amber'), '0'), lab({ label: '', shape: 'dot', children: [lab(leaf('C', 'green'), '0'), lab(leaf('D', 'violet'), '1')] }, '1')] }, '1')] };
  f.tree(spec, { x: 62, y: 62, dx: 62, dy: 72 });
  f.text(160, 322, '0 走左、1 走右；字符都在叶子上', { size: 12, subtle: true });

  f.panel(320, 8, 410, 334, '译码 0110100111：到叶子就输出并回到根');
  const segs = [['0', 'A', 'blue'], ['110', 'C', 'green'], ['10', 'B', 'amber'], ['0', 'A', 'blue'], ['111', 'D', 'violet']];
  let x = 352;
  const cw = 26;
  segs.forEach(([bits, ch, tone]) => {
    const w = bits.length * cw;
    f.rect(x, 64, w, 34, { tone, rx: 6 });
    bits.split('').forEach((b, i) => f.text(x + i * cw + cw / 2, 81, b, { mono: true, bold: true, tone, size: 15 }));
    f.line(x + w / 2, 102, x + w / 2, 130, { tone, arrow: 'end', sw: 1.6 });
    f.text(x + w / 2, 146, ch, { bold: true, tone, size: 17 });
    x += w + 8;
  });
  const rows = [
    ['p = 根', '读 0 → 叶 A：输出，回根'],
    ['p = 根', '读 1,1,0 → 叶 C：输出，回根'],
    ['p = 根', '读 1,0 → 叶 B：输出，回根 …'],
    ['结束时', 'p 必须回到根，否则末尾不完整'],
  ];
  rows.forEach(([a, b], i) => {
    f.text(352, 196 + i * 30, a, { anchor: 'start', size: 12.5, mono: true, bold: true, subtle: true });
    f.text(420, 196 + i * 30, b, { anchor: 'start', size: 12.5, tone: i === 3 ? 'red' : undefined });
  });
  f.save('2020-42-1');
}
{
  const f = new Fig(740, 356);
  const leaf = (c, tone, extra = {}) => ({ label: c, tone, size: 13, ...extra });
  const dot = (children, extra = {}) => ({ label: '', shape: 'dot', children, ...extra });
  f.panel(10, 8, 355, 340, '冲突 ①：插入 1101，途中撞上字符结点 C');
  const newNode = lab({ label: '?', tone: 'red', dash: true, edgeTone: 'red', edgeDash: true, size: 12 }, '1');
  f.tree({ label: '根', size: 12, children: [lab(leaf('A', 'gray'), '0'), lab(dot([lab(leaf('B', 'gray'), '0'), lab(dot([lab(leaf('C', 'red', { edgeTone: 'red', children: [null, newNode], note: '已是码字终点', noteTone: 'red', noteDx: -62, noteDy: 0 }), '0'), lab(leaf('D', 'gray'), '1')], { edgeTone: 'red' }), '1')], { edgeTone: 'red' }), '1')] }, { x: 70, y: 56, dx: 52, dy: 58 });
  f.text(187, 330, '⇒ 旧码字 110 是新码字 1101 的前缀', { size: 12, tone: 'red', bold: true });
  f.panel(375, 8, 355, 340, '冲突 ②：插入 11，终点下方已有孩子');
  f.tree({ label: '根', size: 12, children: [lab(leaf('A', 'gray'), '0'), lab(dot([lab(leaf('B', 'gray'), '0'), lab(dot([lab(leaf('C', 'gray'), '0'), lab(leaf('D', 'gray'), '1')], { tone: 'red', note: '新码字终点', noteDx: 50, noteDy: 0, noteTone: 'red', edgeTone: 'red' }), '1')], { edgeTone: 'red' }), '1')] }, { x: 445, y: 56, dx: 52, dy: 58 });
  f.text(552, 330, '⇒ 新码字 11 是 110、111 的前缀', { size: 12, tone: 'red', bold: true });
  f.save('2020-42-2');
}
