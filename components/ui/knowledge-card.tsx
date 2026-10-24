"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalPane,
  ModalSplit,
  ModalTags,
  ModalTitle,
  ModalToolbar,
} from "@/components/ui/modal"
import { cn } from "@/lib/utils"

/*
 * A deck of knowledge cards in the general Modal (components/ui/modal.tsx):
 * one card at a time, stepped through with the pager, ←/→ or a sideways
 * swipe. It owns structure and motion only; what a card says is up to the
 * caller, who renders the current item into the slots.
 *
 *   <KnowledgeCard count index onIndexChange open onOpenChange>
 *     <KnowledgeCardHeader title tags actions />      pager joins the toolbar
 *     <KnowledgeCardStage columns>
 *       <KnowledgeCardAside>                          left on wide screens,
 *         <KnowledgeCardHero /> <KnowledgeCardSection />   on the muted tone
 *       </KnowledgeCardAside>
 *       <KnowledgeCardMain>                           right: the long part
 *         <KnowledgeCardSection />
 *       </KnowledgeCardMain>
 *     </KnowledgeCardStage>
 *   </KnowledgeCard>
 *
 * Wide screens show the aside and the main column side by side, each
 * scrolling on its own; phones stack them in one scrolling column. The
 * modal keeps one height (44rem by default) so stepping never makes it jump.
 *
 * Stepping swaps whole cards. The old card stays where it is while its
 * content drifts out towards the side it is leaving by; the new card fades
 * in over it with its content settling in from the other side, rows rising
 * one after another (knowledgeCardReveal). Both run at once, each card in
 * its own scroll box, so the new one starts at the top without the old one
 * jumping. Motion lives in styles/knowledge-card.css.
 */

type Direction = "next" | "prev"

type KnowledgeCardLabels = {
  /** Accessible name of the pager group. */
  group: string
  prev: string
  next: string
}

const DEFAULT_LABELS: KnowledgeCardLabels = { group: "切换卡片", prev: "上一张", next: "下一张" }

type KnowledgeCardState = {
  index: number
  count: number
  /** Identifies the current card; a change starts the transition. */
  itemKey: React.Key
  /** Which way the last step went; null until the first step. */
  direction: Direction | null
  hasPrev: boolean
  hasNext: boolean
  go: (index: number) => void
  prev: () => void
  next: () => void
  labels: KnowledgeCardLabels
  stageRef: React.RefObject<HTMLDivElement | null>
}

const KnowledgeCardContext = React.createContext<KnowledgeCardState | null>(null)

/** The deck the caller is rendered in: index, count and navigation. */
function useKnowledgeCard() {
  const card = React.useContext(KnowledgeCardContext)
  if (!card) throw new Error("useKnowledgeCard must be used inside <KnowledgeCard>.")
  return card
}

/** Keys inside these keep their own meaning instead of stepping cards. */
const OWN_KEYS = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='slider'], [role='tablist'], [data-kc-own-keys]"

type KnowledgeCardProps = Omit<React.ComponentProps<typeof ModalContent>, "children"> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Number of cards in the deck. */
  count: number
  /** The card shown. */
  index: number
  onIndexChange: (index: number) => void
  /** Stable identity of the current card; the index by default. */
  itemKey?: React.Key
  /** Step past the last card back to the first, and the other way round. */
  loop?: boolean
  labels?: Partial<KnowledgeCardLabels>
  children: React.ReactNode
}

function KnowledgeCard({
  open,
  onOpenChange,
  count,
  index,
  onIndexChange,
  itemKey = index,
  loop = false,
  labels: labelsProp,
  size = "lg",
  height = "44rem",
  onKeyDown,
  children,
  ...props
}: KnowledgeCardProps) {
  const [direction, setDirection] = React.useState<Direction | null>(null)
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const hasPrev = count > 1 && (loop || index > 0)
  const hasNext = count > 1 && (loop || index < count - 1)

  const step = React.useCallback((target: number, way: Direction) => {
    if (count < 1) return
    const next = loop ? (target + count) % count : target
    if (next < 0 || next >= count || next === index) return
    // Focus inside the leaving card would be dropped with it; keep it in the modal.
    const stage = stageRef.current
    if (stage && stage.contains(document.activeElement)) {
      stage.closest<HTMLElement>('[data-slot="modal-content"]')
        ?.querySelector<HTMLElement>('[data-slot="modal-title"]')
        ?.focus({ preventScroll: true })
    }
    setDirection(way)
    onIndexChange(next)
  }, [count, index, loop, onIndexChange])

  const labels = React.useMemo(() => ({ ...DEFAULT_LABELS, ...labelsProp }), [labelsProp])
  const state = React.useMemo<KnowledgeCardState>(() => ({
    index,
    count,
    itemKey,
    direction,
    hasPrev,
    hasNext,
    go: (target) => step(target, target > index ? "next" : "prev"),
    prev: () => step(index - 1, "prev"),
    next: () => step(index + 1, "next"),
    labels,
    stageRef,
  }), [count, direction, hasNext, hasPrev, index, itemKey, labels, step])

  const handleKeyDown: NonNullable<typeof onKeyDown> = (event) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if ((event.target as Element).closest(OWN_KEYS)) return
    if (event.key === "ArrowLeft" && hasPrev) state.prev()
    else if (event.key === "ArrowRight" && hasNext) state.next()
    else return
    event.preventDefault()
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size={size} height={height} data-knowledge-card="" onKeyDown={handleKeyDown} {...props}>
        <KnowledgeCardContext.Provider value={state}>{children}</KnowledgeCardContext.Provider>
      </ModalContent>
    </Modal>
  )
}

/* ------------------------------------------------------------------------ */
/* Header and pager                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The modal header with the deck's pager at the end of its toolbar.
 * `titleMode="scrolled"` keeps the title out of sight until the card has
 * scrolled under the header on phones, for cards whose hero already names
 * the item; side by side it stays hidden (still read by screen readers).
 */
function KnowledgeCardHeader({
  title,
  titleProps,
  titleMode = "always",
  tags,
  actions,
  pager = true,
  children,
  ...props
}: Omit<React.ComponentProps<typeof ModalHeader>, "title"> & {
  title: React.ReactNode
  titleProps?: Omit<React.ComponentProps<typeof ModalTitle>, "children">
  titleMode?: "always" | "scrolled"
  tags?: React.ReactNode
  /** Extra toolbar buttons, before the pager. */
  actions?: React.ReactNode
  pager?: boolean
}) {
  const { count, labels } = useKnowledgeCard()
  const showPager = pager && count > 1
  return (
    <ModalHeader {...props}>
      <ModalTitle data-kc-title={titleMode} {...titleProps}>
        {title}
      </ModalTitle>
      {tags ? <ModalTags>{tags}</ModalTags> : null}
      {children}
      {actions || showPager ? (
        <ModalToolbar aria-label={labels.group}>
          {actions}
          {showPager ? <KnowledgeCardPager /> : null}
        </ModalToolbar>
      ) : null}
    </ModalHeader>
  )
}

/** Previous · position · next. The position rolls in from the side stepped to. */
function KnowledgeCardPager({ className, ...props }: React.ComponentProps<"span">) {
  const { index, count, direction, hasPrev, hasNext, prev, next, labels } = useKnowledgeCard()
  if (count < 2) return null
  return (
    <span data-slot="kc-pager" className={className} {...props}>
      <button
        type="button"
        data-slot="kc-pager-step"
        aria-label={labels.prev}
        title={`${labels.prev}（←）`}
        disabled={!hasPrev}
        onClick={prev}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </button>
      <span data-slot="kc-pager-count" aria-live="polite" aria-atomic="true">
        <span className="sr-only">第 </span>
        <span key={index} data-slot="kc-pager-current" data-direction={direction ?? undefined}>
          {index + 1}
        </span>
        <span data-slot="kc-pager-total">
          <span aria-hidden="true" data-slot="kc-pager-slash">/</span>
          <span className="sr-only">张，共 </span>
          {count}
        </span>
      </span>
      <button
        type="button"
        data-slot="kc-pager-step"
        aria-label={labels.next}
        title={`${labels.next}（→）`}
        disabled={!hasNext}
        onClick={next}
      >
        <ChevronRightIcon aria-hidden="true" />
      </button>
    </span>
  )
}

/* ------------------------------------------------------------------------ */
/* Stage: the card on show, and the one leaving                              */
/* ------------------------------------------------------------------------ */

type StageEntry = { key: React.Key; children: React.ReactNode; direction: Direction }

/** How far (px) and how straight a touch swipe must go to step. */
const SWIPE_DISTANCE = 56
const SWIPE_SLOPE = 1.6
/** Leaving cards are dropped by their animation; this is the backstop (ms). */
const LEAVE_TIMEOUT = 900

type Swipe = { pointer: number; x: number; y: number }

/**
 * Holds the current card and, during a step, the one leaving. Each is a
 * ModalSplit of its own in the same place; children are the card's panes
 * (KnowledgeCardAside, KnowledgeCardMain). Touch swipes sideways step;
 * set `swipe={false}` when a card holds content that scrolls sideways.
 */
function KnowledgeCardStage({
  columns,
  swipe = true,
  className,
  children,
}: {
  /** grid-template-columns on wide screens. */
  columns?: string
  swipe?: boolean
  className?: string
  children: React.ReactNode
}) {
  const { itemKey, direction, hasPrev, hasNext, prev, next, stageRef } = useKnowledgeCard()
  const committed = React.useRef<{ key: React.Key; children: React.ReactNode }>({ key: itemKey, children })
  const [shownKey, setShownKey] = React.useState(itemKey)
  const [leaving, setLeaving] = React.useState<StageEntry[]>([])
  const swipeRef = React.useRef<Swipe | null>(null)

  // A new card: keep the last one rendered as it was, leaving.
  if (shownKey !== itemKey) {
    const last = committed.current
    setShownKey(itemKey)
    setLeaving((list) => [
      ...list.filter((entry) => entry.key !== itemKey && entry.key !== last.key).slice(-1),
      { key: last.key, children: last.children, direction: direction ?? "next" },
    ])
  }

  React.useLayoutEffect(() => {
    committed.current = { key: itemKey, children }
  })

  React.useEffect(() => {
    if (leaving.length === 0) return
    const timer = window.setTimeout(() => setLeaving([]), LEAVE_TIMEOUT)
    return () => window.clearTimeout(timer)
  }, [leaving])

  const drop = (key: React.Key) => setLeaving((list) => list.filter((entry) => entry.key !== key))

  const swipeHandlers = swipe
    ? {
        onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
          if (event.pointerType !== "touch" || !event.isPrimary) return
          swipeRef.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
        },
        onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
          const start = swipeRef.current
          swipeRef.current = null
          if (!start || start.pointer !== event.pointerId) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return
          if (dx < 0 && hasNext) next()
          else if (dx > 0 && hasPrev) prev()
        },
        onPointerCancel: () => {
          swipeRef.current = null
        },
      }
    : null

  return (
    <div ref={stageRef} data-slot="kc-viewport" data-swipe={swipe ? "" : undefined} className={className} {...swipeHandlers}>
      {leaving
        .filter((entry) => entry.key !== itemKey)
        .map((entry) => (
          <ModalSplit
            key={entry.key}
            columns={columns}
            data-kc-stage="leaving"
            data-direction={entry.direction}
            inert
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) drop(entry.key)
            }}
          >
            {entry.children}
          </ModalSplit>
        ))}
      <ModalSplit
        key={itemKey}
        columns={columns}
        data-kc-stage="current"
        data-direction={direction ?? undefined}
      >
        {children}
      </ModalSplit>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Card regions                                                              */
/* ------------------------------------------------------------------------ */

type RegionProps = Omit<React.ComponentProps<typeof ModalPane>, "tone">

/** The card's own pane: left on wide screens, first on phones, on the muted tone. */
function KnowledgeCardAside({ className, children, ...props }: RegionProps) {
  return (
    <ModalPane tone="muted" data-kc-region="aside" {...props}>
      <div data-slot="kc-content" className={className}>
        {children}
      </div>
    </ModalPane>
  )
}

/** The long part of the card: right on wide screens, below the aside on phones. */
function KnowledgeCardMain({ className, children, ...props }: RegionProps) {
  return (
    <ModalPane data-kc-region="main" {...props}>
      <div data-slot="kc-content" className={className}>
        {children}
      </div>
    </ModalPane>
  )
}

/**
 * The head of a card: a large title, a line under it and a badge on the
 * title's first line. Children follow below.
 */
function KnowledgeCardHero({
  title,
  subtitle,
  badge,
  titleProps,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode
  subtitle?: React.ReactNode
  badge?: React.ReactNode
  titleProps?: React.ComponentProps<"span">
}) {
  return (
    <div data-slot="kc-hero" className={className} {...props}>
      <div data-slot="kc-hero-headline">
        <span data-slot="kc-hero-title" {...titleProps}>
          {title}
        </span>
        {badge ? <span data-slot="kc-hero-badge">{badge}</span> : null}
      </div>
      {subtitle ? <div data-slot="kc-hero-subtitle">{subtitle}</div> : null}
      {children}
    </div>
  )
}

/** A labelled block of a card: a small caps label, an optional note on the right, then the body. */
function KnowledgeCardSection({
  label,
  meta,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & {
  label?: React.ReactNode
  meta?: React.ReactNode
}) {
  const labelId = React.useId()
  return (
    <section
      data-slot="kc-section"
      aria-labelledby={label && !props["aria-label"] ? labelId : undefined}
      className={className}
      {...props}
    >
      {label || meta ? (
        <div data-slot="kc-section-head">
          {label ? (
            <span id={labelId} data-slot="kc-section-label">
              {label}
            </span>
          ) : null}
          {meta ? <span data-slot="kc-section-meta">{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/**
 * Props that make an element rise into place as its card settles, `order`
 * steps after the first. Spread onto any element inside a card; pass the
 * element's own style to keep it.
 */
function knowledgeCardReveal(order: number, style?: React.CSSProperties) {
  return {
    "data-kc-reveal": "",
    style: { ...style, "--kc-i": Math.min(order, 12) } as React.CSSProperties,
  }
}

export {
  KnowledgeCard,
  KnowledgeCardAside,
  KnowledgeCardHeader,
  KnowledgeCardHero,
  KnowledgeCardMain,
  KnowledgeCardPager,
  KnowledgeCardSection,
  KnowledgeCardStage,
  knowledgeCardReveal,
  useKnowledgeCard,
}
export type { KnowledgeCardLabels, KnowledgeCardProps }
