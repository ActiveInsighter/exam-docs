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
      {topic} · 第 {index + 1} 段。顶栏是一层磨砂玻璃：内容从它下方滚过时被柔和地模糊，标题和按钮依旧清楚；
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

const LEVELS = [
  {
    title: '第 1 层 · 题目列表',
    text: '点击下面的按钮，在这一层之上再打开一层。这一层会从底边微微后退、变窄并变暗，顶部露出一条，像一叠卡片。',
    paragraphs: 6,
  },
  {
    title: '第 2 层 · 收藏与标签',
    text: '新一层至少与下层同宽，所以下层只从顶部露出。返回按钮、Esc 或点击露出的那一条都只关闭这一层；右上角的「全部关闭」关闭整个栈。',
    paragraphs: 2,
  },
  {
    title: '第 3 层 · 确认',
    text: '再深一层时，最底层退得更远、更暗。这一层很矮，下面两层保持原位，不会跟着沉下去。',
    paragraphs: 0,
  },
] as const;

/** One level of the nested demo; each level can open the next. */
function Level({ index }: { index: number }) {
  const [open, setOpen] = useState(false);
  const modal = useModal();
  const level = LEVELS[index];
  const last = index === LEVELS.length - 1;
  return (
    <>
      <ModalHeader>
        <ModalTitle>{level.title}</ModalTitle>
        <ModalTags>
          <Chip tone={String(index + 1)}>depth {modal?.depth ?? index}</Chip>
        </ModalTags>
      </ModalHeader>
      <ModalBody>
        <p className="mb-4 leading-7">{level.text}</p>
        <Paragraphs count={level.paragraphs} topic={level.title} />
      </ModalBody>
      <ModalFooter>
        {index > 0 ? (
          <Button variant="ghost" className="h-9 rounded-full px-4" onClick={() => modal?.closeAll()}>全部关闭</Button>
        ) : null}
        {!last ? (
          <Button className="h-9 rounded-full px-4" onClick={() => setOpen(true)}>
            <Layers3Icon data-icon="inline-start" />打开第 {index + 2} 层
          </Button>
        ) : (
          <Button className="h-9 rounded-full px-4" onClick={() => modal?.close()}>返回上一层</Button>
        )}
      </ModalFooter>
      {!last ? (
        <Modal open={open} onOpenChange={setOpen}>
          <ModalContent size="sm">
            <Level index={index + 1} />
          </ModalContent>
        </Modal>
      ) : null}
    </>
  );
}

function NestedDemo() {
  return (
    <DemoFrame caption="多级弹窗：在弹窗内渲染 <Modal> 即叠加一层，像一叠卡片。三层高度各不相同，下层总是只在需要时抬起，露出顶部一条。">
      <Modal>
        <ModalTrigger className={trigger}>
          <BookmarkIcon className="size-4" />多级弹窗
        </ModalTrigger>
        <ModalContent size="lg">
          <Level index={0} />
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

const DEMOS = {
  basic: BasicDemo,
  toolbar: ToolbarDemo,
  split: SplitDemo,
  nested: NestedDemo,
  sizes: SizesDemo,
};

export function ModalDemo({ kind }: { kind: keyof typeof DEMOS }) {
  const Demo = DEMOS[kind];
  return <Demo />;
}
