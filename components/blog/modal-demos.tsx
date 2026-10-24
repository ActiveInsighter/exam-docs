'use client';

import { BookmarkIcon, CopyIcon, Layers3Icon, Share2Icon, StarIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalPane,
  ModalSplit,
  ModalTags,
  ModalTitle,
  ModalToolbar,
  ModalTrigger,
  useModal,
} from '@/components/ui/modal';
import {
  StudyCard,
  StudyCardAside,
  StudyCardHeader,
  StudyCardHero,
  StudyCardMain,
  StudyCardSection,
  StudyCardStage,
  studyCardReveal,
} from '@/components/ui/study-card';
import { cn } from '@/lib/utils';

/*
 * Live demos of components/ui/modal.tsx for the blog's component showcase.
 * Registered only on blog pages (app/(home)/blog), so documentation pages
 * never load them.
 */

const trigger = cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'h-10 rounded-full px-4');
const toolButton = 'size-8 rounded-full text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground';

function Chip({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span data-question-tag="" data-tone={tone}>
      <span>{children}</span>
    </span>
  );
}

function Paragraphs({ count, topic }: { count: number; topic: string }) {
  return Array.from({ length: count }, (_, index) => (
    <p key={index} className="mb-4 leading-7 text-foreground/90">
      {topic} · 第 {index + 1} 段。顶栏没有底色，按钮与标签是磨砂玻璃：内容滚到顶栏下方时柔和淡出，标题和按钮依旧清楚；
      滚回顶部，它与弹窗表面融为一体。手机和宽屏都是从底部弹出的抽屉，按住顶栏向下拖动即可关闭。
    </p>
  ));
}

function DemoFrame({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="not-prose my-6 flex flex-col items-start gap-3 rounded-(--ui-radius-panel) bg-(--ui-fill) p-5 font-sans">
      <div className="flex flex-wrap gap-2">{children}</div>
      <p className="text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

function BasicDemo() {
  return (
    <DemoFrame caption="标题 + 描述 + 单栏内容 + 底部按钮。Esc、遮罩、关闭按钮或下拉顶栏都能关闭。">
      <Modal>
        <ModalTrigger className={trigger}>打开基础弹窗</ModalTrigger>
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>基础弹窗</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <ModalDescription className="mb-4 text-sm text-muted-foreground">
              ModalBody 是单栏滚动区，内容足够长时会从顶栏下方滚过。
            </ModalDescription>
            <Paragraphs count={8} topic="基础弹窗" />
          </ModalBody>
          <ModalFooter>
            <FooterActions />
          </ModalFooter>
        </ModalContent>
      </Modal>
    </DemoFrame>
  );
}

function FooterActions() {
  const modal = useModal();
  return (
    <>
      <Button variant="ghost" className="h-9 rounded-full px-4" onClick={() => modal?.close()}>取消</Button>
      <Button className="h-9 rounded-full px-4" onClick={() => modal?.close()}>确定</Button>
    </>
  );
}

function ToolbarDemo() {
  const [starred, setStarred] = useState(false);
  return (
    <DemoFrame caption="顶栏放标签与工具栏：宽屏与标题同行，手机上标签换到第二行横向滚动。">
      <Modal>
        <ModalTrigger className={trigger}>标签与工具栏</ModalTrigger>
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>线性代数 · 第 3 章</ModalTitle>
            <ModalTags>
              <Chip tone="3">矩阵</Chip>
              <Chip tone="5">特征值</Chip>
              <Chip tone="1">易错</Chip>
              <Chip tone="7">2024 真题</Chip>
            </ModalTags>
            <ModalToolbar aria-label="操作">
              <Button variant="ghost" size="icon" className={cn(toolButton, starred && 'text-warning hover:text-warning')} aria-pressed={starred} aria-label="收藏" onClick={() => setStarred(!starred)}>
                <StarIcon className={cn(starred && 'fill-current')} />
              </Button>
              <Button variant="ghost" size="icon" className={toolButton} aria-label="复制链接"><CopyIcon /></Button>
              <Button variant="ghost" size="icon" className={toolButton} aria-label="分享"><Share2Icon /></Button>
            </ModalToolbar>
          </ModalHeader>
          <ModalBody>
            <Paragraphs count={10} topic="标签与工具栏" />
          </ModalBody>
        </ModalContent>
      </Modal>
    </DemoFrame>
  );
}

function SplitDemo() {
  return (
    <DemoFrame caption="ModalSplit + ModalPane：宽屏左右分栏、各自滚动，左栏使用较浅底色；手机合并为一列。">
      <Modal>
        <ModalTrigger className={trigger}>左右分栏</ModalTrigger>
        <ModalContent size="xl" className="md:min-h-[min(32rem,calc(100dvh-2.5rem))]">
          <ModalHeader>
            <ModalTitle>题目与解析</ModalTitle>
            <ModalTags>
              <Chip>解答题</Chip>
              <Chip tone="2">概率论</Chip>
            </ModalTags>
          </ModalHeader>
          <ModalSplit columns="minmax(0,0.9fr) minmax(0,1.1fr)">
            <ModalPane tone="muted">
              <h3 className="mb-3 text-xs font-medium tracking-wider text-muted-foreground">题目</h3>
              <Paragraphs count={4} topic="左栏" />
            </ModalPane>
            <ModalPane>
              <h3 className="mb-3 text-xs font-medium tracking-wider text-muted-foreground">解析</h3>
              <Paragraphs count={12} topic="右栏" />
            </ModalPane>
          </ModalSplit>
        </ModalContent>
      </Modal>
    </DemoFrame>
  );
}

const PAGES = [
  {
    title: '题目列表',
    text: '点击下面的按钮打开下一页。它不会再叠一个弹窗，而是在同一个面板里从右侧推入，这一页向左退开并变暗；左上角出现返回按钮。',
    paragraphs: 6,
  },
  {
    title: '收藏与标签',
    text: '面板宽度不变，高度只会为更高的页面长高，不会因为这一页较短而缩小。返回按钮或 Esc 回到上一页，右上角的关闭按钮、点遮罩或下拉顶栏关闭整个面板。',
    paragraphs: 2,
  },
  {
    title: '确认',
    text: '再深一页也一样。返回时上一页保留原来的滚动位置和状态，焦点回到打开这一页的按钮。',
    paragraphs: 0,
  },
] as const;

/** One page of the navigation demo; each page can push the next. */
function Page({ index }: { index: number }) {
  const modal = useModal();
  const page = PAGES[index];
  const last = index === PAGES.length - 1;
  return (
    <>
      <ModalHeader>
        <ModalTitle>{page.title}</ModalTitle>
        <ModalTags>
          <Chip tone={String(index + 1)}>第 {index + 1} 页</Chip>
        </ModalTags>
      </ModalHeader>
      <ModalBody>
        <p className="mb-4 leading-7">{page.text}</p>
        <Paragraphs count={page.paragraphs} topic={page.title} />
      </ModalBody>
      <ModalFooter>
        {index > 0 ? (
          <Button variant="ghost" className="h-9 rounded-full px-4" onClick={() => modal?.closeAll()}>关闭面板</Button>
        ) : null}
        {!last ? (
          <Modal>
            <ModalTrigger className={cn(buttonVariants(), 'h-9 rounded-full px-4')}>
              <Layers3Icon data-icon="inline-start" />打开「{PAGES[index + 1].title}」
            </ModalTrigger>
            <ModalContent>
              <Page index={index + 1} />
            </ModalContent>
          </Modal>
        ) : (
          <Button className="h-9 rounded-full px-4" onClick={() => modal?.close()}>返回上一页</Button>
        )}
      </ModalFooter>
    </>
  );
}

function NestedDemo() {
  return (
    <DemoFrame caption="页面切换：在弹窗内容里再渲染 <Modal>，它成为同一面板的下一页，从右向左推入；左上角返回，Esc 也返回一页。">
      <Modal>
        <ModalTrigger className={trigger}>
          <BookmarkIcon className="size-4" />页面切换
        </ModalTrigger>
        <ModalContent size="lg">
          <Page index={0} />
        </ModalContent>
      </Modal>
    </DemoFrame>
  );
}

const SIZES = [
  ['sm', '28rem'],
  ['md', '40rem'],
  ['lg', '56rem'],
  ['xl', '76rem'],
  ['full', '整屏'],
] as const;

function SizesDemo() {
  return (
    <DemoFrame caption="size 只限制宽屏上的最大宽度；手机上始终铺满屏幕宽度。">
      {SIZES.map(([size, width]) => (
        <Modal key={size}>
          <ModalTrigger className={trigger}>{size}</ModalTrigger>
          <ModalContent size={size}>
            <ModalHeader>
              <ModalTitle>size=&quot;{size}&quot;</ModalTitle>
              <ModalTags><Chip>{width}</Chip></ModalTags>
            </ModalHeader>
            <ModalBody>
              <Paragraphs count={3} topic={`尺寸 ${size}`} />
            </ModalBody>
          </ModalContent>
        </Modal>
      ))}
    </DemoFrame>
  );
}

const HEIGHTS = [
  ['auto', '随内容'],
  ['fixed', '占满可用高度'],
  ['30rem', '固定 30rem'],
] as const;

/** Content that grows and shrinks in place, to show which heights follow it. */
function GrowingBody() {
  const [count, setCount] = useState(1);
  return (
    <ModalBody>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" className="h-9 rounded-full px-4" onClick={() => setCount((value) => Math.min(value + 2, 9))}>
          加两段
        </Button>
        <Button variant="ghost" className="h-9 rounded-full px-4" onClick={() => setCount(1)}>
          只留一段
        </Button>
      </div>
      <Paragraphs count={count} topic="高度" />
    </ModalBody>
  );
}

function HeightDemo() {
  return (
    <DemoFrame caption="height：auto 随内容伸缩；fixed 占满可用高度；CSS 长度固定为该高度。都不超过视口。在弹窗里增删段落，看高度是否跟着变。">
      {HEIGHTS.map(([height, label]) => (
        <Modal key={height}>
          <ModalTrigger className={trigger}>{height}</ModalTrigger>
          <ModalContent size="md" height={height}>
            <ModalHeader>
              <ModalTitle>height=&quot;{height}&quot;</ModalTitle>
              <ModalTags><Chip>{label}</Chip></ModalTags>
            </ModalHeader>
            <GrowingBody />
          </ModalContent>
        </Modal>
      ))}
    </DemoFrame>
  );
}

const CONCEPTS = [
  {
    term: '极限',
    tint: 'oklch(0.62 0.13 250)',
    english: 'limit',
    tag: '函数与极限',
    points: ['ε-δ 定义刻画“任意接近”', '左右极限存在且相等', '四则运算与夹逼准则'],
    sections: [
      ['定义', '对任意 ε > 0，存在 δ > 0，当 0 < |x − x₀| < δ 时，恒有 |f(x) − A| < ε，则称 A 为 f(x) 在 x₀ 处的极限。'],
      ['常用方法', '等价无穷小替换、洛必达法则、泰勒展开，以及单调有界准则。'],
      ['易错点', '等价无穷小只能在乘除中替换；加减时需展开到足够阶数。'],
    ],
  },
  {
    term: '导数',
    tint: 'oklch(0.64 0.1 182)',
    english: 'derivative',
    tag: '一元微分',
    points: ['函数增量与自变量增量之比的极限', '几何意义：切线斜率', '可导必连续，反之不然'],
    sections: [
      ['定义', 'f′(x₀) = lim (f(x₀ + Δx) − f(x₀)) / Δx，Δx → 0；左右导数存在且相等时可导。'],
      ['常用方法', '复合函数链式法则、隐函数求导、参数方程求导与对数求导法。'],
      ['易错点', '分段函数在分段点处须用定义求导，不能直接对两段公式求导后比较。'],
    ],
  },
  {
    term: '定积分',
    tint: 'oklch(0.66 0.12 40)',
    english: 'definite integral',
    tag: '一元积分',
    points: ['分割、近似、求和、取极限', '几何意义：有向面积', '牛顿—莱布尼茨公式连接微分与积分'],
    sections: [
      ['定义', '把区间分成 n 份，作黎曼和 Σ f(ξᵢ)Δxᵢ，当最大子区间长度趋于 0 时的极限。'],
      ['常用方法', '换元积分、分部积分、对称区间上的奇偶性，以及区间再现公式。'],
      ['易错点', '换元时上下限要同时换；被积函数在区间内无界时要按反常积分处理。'],
    ],
  },
] as const;

function StudyDemo() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const concept = CONCEPTS[index];
  return (
    <DemoFrame caption="StudyCard 只提供结构与动效：顶栏翻页器、左右分栏（ratio 控制比例）、可选彩色底的左栏、卡片切换动画、←/→ 与左右滑动；内容由调用方填进 Aside / Main。">
      <Button variant="secondary" size="lg" className="h-10 rounded-full px-4" onClick={() => setOpen(true)}>
        <Layers3Icon data-icon="inline-start" />学习卡片
      </Button>
      <StudyCard
        open={open}
        onOpenChange={setOpen}
        count={CONCEPTS.length}
        index={index}
        onIndexChange={setIndex}
        labels={{ group: '切换概念', prev: '上一个概念', next: '下一个概念' }}
        tint={concept.tint}
        height="34rem"
      >
        <StudyCardHeader title={concept.term} titleMode="scrolled" />
        <StudyCardStage ratio={0.45}>
          <StudyCardAside>
            <StudyCardHero title={concept.term} subtitle={concept.english} badge={<Chip tone="5">{concept.tag}</Chip>} />
            <StudyCardSection label="要点">
              <ul className="grid gap-2 text-[0.9375rem] leading-relaxed">
                {concept.points.map((point, order) => (
                  <li key={point} className="rounded-xl bg-(--ui-fill) px-3 py-2" {...studyCardReveal(order)}>
                    {point}
                  </li>
                ))}
              </ul>
            </StudyCardSection>
          </StudyCardAside>
          <StudyCardMain>
            {concept.sections.map(([label, text], order) => (
              <StudyCardSection key={label} label={label} {...studyCardReveal(order)}>
                <p className="leading-7 text-foreground/90">{text}</p>
              </StudyCardSection>
            ))}
          </StudyCardMain>
        </StudyCardStage>
      </StudyCard>
    </DemoFrame>
  );
}

const DEMOS = {
  basic: BasicDemo,
  toolbar: ToolbarDemo,
  split: SplitDemo,
  nested: NestedDemo,
  sizes: SizesDemo,
  heights: HeightDemo,
  study: StudyDemo,
};

export function ModalDemo({ kind }: { kind: keyof typeof DEMOS }) {
  const Demo = DEMOS[kind];
  return <Demo />;
}
