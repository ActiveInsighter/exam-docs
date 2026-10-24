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

/*
 * A deck of study cards on the general Modal (components/ui/modal.tsx): one
 * card at a time, stepped through with the pager, ←/→ or a sideways swipe.
 * It owns structure and motion only; what a card says is up to the caller,
 * who renders the current item into the slots.
 *
 *   <StudyCard count index onIndexChange open onOpenChange tint>
 *     <StudyCardHeader title tags actions />        pager joins the toolbar
 *     <StudyCardStage ratio={0.45}>
 *       <StudyCardAside>                            left on wide screens,
 *         <StudyCardHero /> <StudyCardSection />    on the card's tone
 *       </StudyCardAside>
 *       <StudyCardMain>                             right: the long part
 *         <StudyCardSection />
 *       </StudyCardMain>
 *     </StudyCardStage>
 *     <Modal>…</Modal>                              a page pushed onto the card
 *   </StudyCard>
 *
 * Layout. Wide screens show the aside and the main column side by side, each
 * scrolling on its own, at the ratio given (or any grid columns); a card
 * with only one of them takes the whole width. Phones stack them in one
 * scrolling column. The modal keeps one height (44rem by default) so
 * stepping never makes it jump.
 *
 * Tone. The aside sits on the modal's muted tone, or, with `tint`, on a soft
 * wash of that colour (a calm base and two faint glows); the tint follows
 * the theme, and a card can change it as it steps.
 *
 * Motion. Stepping swaps whole cards. The old card stays where it is while
 * its content drifts out towards the side it is leaving by; the new card
 * fades in over it with its content settling in from the other side, rows
 * rising one after another (studyCardReveal). Both run at once, each card
 * in its own scroll box, so the new one starts at the top without the old
 * one jumping. Motion lives in styles/study-card.css.
 */

type Direction = "next" | "prev"

type StudyCardLabels = {
  /** Accessible name of the pager group. */
  group: string
  prev: string
  next: string
}

const DEFAULT_LABELS: StudyCardLabels = { group: "切换卡片", prev: "上一张", next: "下一张" }

type StudyCardState = {
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
  labels: StudyCardLabels
  stageRef: React.RefObject<HTMLDivElement | null>
}

const StudyCardContext = React.createContext<StudyCardState | null>(null)

/** The deck the caller is rendered in: index, count and navigation. */
function useStudyCard() {
  const card = React.useContext(StudyCardContext)
  if (!card) throw new Error("useStudyCard must be used inside <StudyCard>.")
  return card
}

/** Keys inside these keep their own meaning instead of stepping cards. */
const OWN_KEYS = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='slider'], [role='tablist'], [data-sc-own-keys]"

type StudyCardProps = Omit<React.ComponentProps<typeof ModalContent>, "children"> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Number of cards in the deck. */
  count: number
  /** The card shown; leave it out (with defaultIndex) to let the deck keep it. */
  index?: number
  defaultIndex?: number
  onIndexChange?: (index: number) => void
  /** Stable identity of the current card; the index by default. */
  itemKey?: React.Key
  /** Step past the last card back to the first, and the other way round. */
  loop?: boolean
  labels?: Partial<StudyCardLabels>
  /** Any CSS colour: the aside sits on a soft wash of it instead of the muted tone. */
  tint?: string
  children: React.ReactNode
}

function StudyCard({
  open,
  onOpenChange,
  count,
  index: indexProp,
  defaultIndex = 0,
  onIndexChange,
  itemKey: itemKeyProp,
  loop = false,
  labels: labelsProp,
  tint,
  size = "lg",
  height = "44rem",
  onKeyDown,
  style,
  children,
  ...props
}: StudyCardProps) {
  const [ownIndex, setOwnIndex] = React.useState(defaultIndex)
  const index = Math.min(Math.max(indexProp ?? ownIndex, 0), Math.max(count - 1, 0))
  const itemKey = itemKeyProp ?? index
  const [direction, setDirection] = React.useState<Direction | null>(null)
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const hasPrev = count > 1 && (loop || index > 0)
  const hasNext = count > 1 && (loop || index < count - 1)

  const step = React.useCallback((target: number, way: Direction) => {
    if (count < 1) return
    const next = loop ? (target + count) % count : target
    if (next < 0 || next >= count || next === index) return
    // Focus inside the leaving card would be dropped with it; keep it on the page.
    const stage = stageRef.current
    if (stage && stage.contains(document.activeElement)) {
      stage.closest<HTMLElement>('[data-slot="modal-page"]')
        ?.querySelector<HTMLElement>('[data-slot="modal-title"]')
        ?.focus({ preventScroll: true })
    }
    setDirection(way)
    setOwnIndex(next)
    onIndexChange?.(next)
  }, [count, index, loop, onIndexChange])

  const labels = React.useMemo(() => ({ ...DEFAULT_LABELS, ...labelsProp }), [labelsProp])
  const state = React.useMemo<StudyCardState>(() => ({
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
    const target = event.target as Element
    if (target.closest(OWN_KEYS)) return
    // Only the card's own page steps; a page pushed on top keeps its arrows.
    if (target.closest('[data-slot="modal-page"]:not([data-depth="0"])')) return
    if (event.key === "ArrowLeft" && hasPrev) state.prev()
    else if (event.key === "ArrowRight" && hasNext) state.next()
    else return
    event.preventDefault()
  }

  const tintStyle = tint ? { "--sc-tint": tint } as React.CSSProperties : undefined
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size={size}
        height={height}
        data-study-card=""
        data-tint={tint ? "" : undefined}
        onKeyDown={handleKeyDown}
        style={typeof style === "function"
          ? (popupState) => ({ ...tintStyle, ...style(popupState) })
          : { ...tintStyle, ...style }}
        {...props}
      >
        <StudyCardContext.Provider value={state}>{children}</StudyCardContext.Provider>
      </ModalContent>
    </Modal>
  )
}

/* ------------------------------------------------------------------------ */
/* Header and pager                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The modal header with the deck's pager at the end of its toolbar, so the
 * card's own actions and the pager share one capsule in the top right.
 * `titleMode="scrolled"` keeps the title out of sight until the card has
 * scrolled under the header on phones, for cards whose hero already names
 * the item; side by side it stays hidden (still read by screen readers).
 */
function StudyCardHeader({
  title,
  titleProps,
  titleMode = "always",
  tags,
  tagsProps,
  actions,
  actionsLabel,
  pager = true,
  children,
  ...props
}: Omit<React.ComponentProps<typeof ModalHeader>, "title"> & {
  title: React.ReactNode
  titleProps?: Omit<React.ComponentProps<typeof ModalTitle>, "children">
  titleMode?: "always" | "scrolled"
  tags?: React.ReactNode
  tagsProps?: Omit<React.ComponentProps<typeof ModalTags>, "children">
  /** Extra toolbar buttons, before the pager. */
  actions?: React.ReactNode
  /** Accessible name of the toolbar; the pager's group label by default. */
  actionsLabel?: string
  pager?: boolean
}) {
  const { count, labels, itemKey, direction } = useStudyCard()
  const showPager = pager && count > 1
  return (
    <ModalHeader {...props}>
      <ModalTitle data-sc-title={titleMode} {...titleProps}>
        {/* Keyed by card, so a step slides the new title in from the side stepped to. */}
        <span key={itemKey} data-slot="sc-title-text" data-direction={direction ?? undefined}>
          {title}
        </span>
      </ModalTitle>
      {tags ? <ModalTags {...tagsProps}>{tags}</ModalTags> : null}
      {children}
      {actions || showPager ? (
        <ModalToolbar aria-label={actionsLabel ?? labels.group}>
          {actions}
          {showPager ? <StudyCardPager /> : null}
        </ModalToolbar>
      ) : null}
    </ModalHeader>
  )
}

/** Previous · position · next. The position rolls in from the side stepped to. */
function StudyCardPager({ className, ...props }: React.ComponentProps<"span">) {
  const { index, count, direction, hasPrev, hasNext, prev, next, labels } = useStudyCard()
  if (count < 2) return null
  return (
    <span data-slot="sc-pager" className={className} {...props}>
      <button
        type="button"
        data-slot="sc-pager-step"
        aria-label={labels.prev}
        title={`${labels.prev}（←）`}
        disabled={!hasPrev}
        onClick={prev}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </button>
      <span data-slot="sc-pager-count" aria-live="polite" aria-atomic="true">
        <span className="sr-only">第 </span>
        <span key={index} data-slot="sc-pager-current" data-direction={direction ?? undefined}>
          {index + 1}
        </span>
        <span data-slot="sc-pager-total">
          <span aria-hidden="true" data-slot="sc-pager-slash">/</span>
          <span className="sr-only">张，共 </span>
          {count}
        </span>
      </span>
      <button
        type="button"
        data-slot="sc-pager-step"
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

/** A swipe that starts on content scrolling sideways (a wide formula, a table) scrolls it instead. */
function scrollsSideways(target: EventTarget | null, stage: HTMLElement) {
  for (let element = target instanceof Element ? target : null; element && element !== stage; element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth + 1) {
      const overflow = getComputedStyle(element).overflowX
      if (overflow === "auto" || overflow === "scroll") return true
    }
  }
  return false
}

/** Columns for an aside share between 0 and 1. */
function ratioColumns(ratio: number) {
  const aside = Math.min(0.8, Math.max(0.2, ratio))
  return `minmax(0, ${aside.toFixed(3)}fr) minmax(0, ${(1 - aside).toFixed(3)}fr)`
}

/**
 * Holds the current card and, during a step, the one leaving. Each is a
 * ModalSplit of its own in the same place; children are the card's panes
 * (StudyCardAside, StudyCardMain), or one of them for a single column.
 * Touch swipes sideways step; set `swipe={false}` when a card is mostly
 * content that scrolls sideways.
 */
function StudyCardStage({
  ratio,
  columns = ratio === undefined ? undefined : ratioColumns(ratio),
  swipe = true,
  className,
  children,
}: {
  /** The aside's share of the width on wide screens (0.2–0.8); equal halves by default. */
  ratio?: number
  /** Any grid-template-columns instead of a ratio. */
  columns?: string
  swipe?: boolean
  className?: string
  children: React.ReactNode
}) {
  const { itemKey, direction, hasPrev, hasNext, prev, next, stageRef } = useStudyCard()
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
          if (scrollsSideways(event.target, event.currentTarget)) return
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
    <div ref={stageRef} data-slot="sc-viewport" data-swipe={swipe ? "" : undefined} className={className} {...swipeHandlers}>
      {leaving
        .filter((entry) => entry.key !== itemKey)
        .map((entry) => (
          <ModalSplit
            key={entry.key}
            columns={columns}
            data-sc-stage="leaving"
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
        data-sc-stage="current"
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

/** The card's own pane: left on wide screens, first on phones, on the card's tone. */
function StudyCardAside({ className, children, ...props }: RegionProps) {
  return (
    <ModalPane tone="muted" data-sc-region="aside" {...props}>
      <div data-slot="sc-content" className={className}>
        {children}
      </div>
    </ModalPane>
  )
}

/** The long part of the card: right on wide screens, below the aside on phones. */
function StudyCardMain({ className, children, ...props }: RegionProps) {
  return (
    <ModalPane data-sc-region="main" {...props}>
      <div data-slot="sc-content" className={className}>
        {children}
      </div>
    </ModalPane>
  )
}

/**
 * The head of a card: a large title, a line under it and a badge on the
 * title's first line. Children follow below.
 */
function StudyCardHero({
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
    <div data-slot="sc-hero" className={className} {...props}>
      <div data-slot="sc-hero-headline">
        <span data-slot="sc-hero-title" {...titleProps}>
          {title}
        </span>
        {badge ? <span data-slot="sc-hero-badge">{badge}</span> : null}
      </div>
      {subtitle ? <div data-slot="sc-hero-subtitle">{subtitle}</div> : null}
      {children}
    </div>
  )
}

/** A labelled block of a card: a small caps label, an optional note or action on the right, then the body. */
function StudyCardSection({
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
      data-slot="sc-section"
      aria-labelledby={label && !props["aria-label"] ? labelId : undefined}
      className={className}
      {...props}
    >
      {label || meta ? (
        <div data-slot="sc-section-head">
          {label ? (
            <span id={labelId} data-slot="sc-section-label">
              {label}
            </span>
          ) : null}
          {meta ? <span data-slot="sc-section-meta">{meta}</span> : null}
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
function studyCardReveal(order: number, style?: React.CSSProperties) {
  return {
    "data-sc-reveal": "",
    style: { ...style, "--sc-i": Math.min(order, 12) } as React.CSSProperties,
  }
}

export {
  StudyCard,
  StudyCardAside,
  StudyCardHeader,
  StudyCardHero,
  StudyCardMain,
  StudyCardPager,
  StudyCardSection,
  StudyCardStage,
  studyCardReveal,
  useStudyCard,
}
export type { StudyCardLabels, StudyCardProps }
