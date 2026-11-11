"use client"

import * as React from "react"
import { AnimateIcon } from "@animate-ui/react/icons"
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number"
import {
  blur,
  ReducedMotionConfig,
  shift,
  transition,
  useShouldReduceMotion,
  useTempoTransition,
} from "@animate-ui/react/utils/motion"
import { AnimatePresence, motion, type PanInfo, type Variants } from "motion/react"

import { ChevronLeftIcon } from "@/components/animate-ui/icons/chevron-left"
import { ChevronRightIcon } from "@/components/animate-ui/icons/chevron-right"
import { Button } from "@/components/ui/button"
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
 * A deck of study cards on the general Modal (components/ui/modal.tsx): one
 * card at a time, stepped through with the pager, ←/→ or a sideways swipe.
 * It owns structure and motion only; what a card says is up to the caller,
 * who renders the current item into the slots.
 *
 *   <StudyCard count index onIndexChange open onOpenChange tint>
 *     <StudyCardHeader title tags actions />        pager joins the toolbar
 *     <StudyCardStage ratio={0.45}>
 *       <StudyCardAside>                            left from md up,
 *         <StudyCardHero /> <StudyCardSection />    on the card's tone
 *       </StudyCardAside>
 *       <StudyCardMain>                             right: the long part
 *         <StudyCardSection />
 *       </StudyCardMain>
 *     </StudyCardStage>
 *     <Modal>…</Modal>                              a sheet stacked on the card
 *   </StudyCard>
 *
 * Layout. From md up the aside and the main column sit side by side, each
 * scrolling on its own, at the ratio given (or any grid columns); a card
 * with only one of them takes the whole width. Phones stack them in one
 * scrolling column. The modal keeps one height (44rem by default) so
 * stepping never makes it jump.
 *
 * Motion. A step is Animate UI's "steps of a flow": the card on show leaves
 * towards the side it is stepped away from, fading into a light blur, then
 * the next one arrives from the other side, its sections settling one after
 * another. Only the content of the panes moves; the panes and their tones
 * stay put, so the card itself never flashes. The title swaps the same way
 * and the pager's number rolls.
 */

/** 1 towards the next card, -1 towards the previous one. */
type Direction = 1 | -1

type StudyCardLabels = {
  /** Accessible name of the pager group. */
  group: string
  prev: string
  next: string
}

const DEFAULT_LABELS: StudyCardLabels = { group: "切换卡片", prev: "上一张", next: "下一张" }

type StudyCardContextValue = {
  index: number
  count: number
  /** Identifies the current card; a change starts the transition. */
  itemKey: React.Key
  /** Which way the last step went. */
  direction: Direction
  hasPrev: boolean
  hasNext: boolean
  go: (index: number) => void
  prev: () => void
  next: () => void
  labels: StudyCardLabels
}

const StudyCardContext = React.createContext<StudyCardContextValue | null>(null)

/** The deck the caller is rendered in: index, count and navigation. */
function useStudyCard() {
  const card = React.useContext(StudyCardContext)
  if (!card) throw new Error("useStudyCard must be used inside <StudyCard>.")
  return card
}

/** Keys inside these keep their own meaning instead of stepping cards. */
const OWN_KEYS = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='slider'], [role='tablist'], [data-study-card-own-keys]"

type StudyCardProps = Omit<React.ComponentProps<typeof ModalContent>, "children" | "ref"> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** After the open or close animation has finished. */
  onOpenChangeComplete?: (open: boolean) => void
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

/** A calm base of the tint with two faint glows: one where the eye starts, an echo in the far corner. */
const tinted = cn(
  "[--modal-pane-muted:color-mix(in_oklch,var(--study-card-tint)_10%,var(--modal-surface))]",
  "[&_[data-slot=modal-pane][data-tone=muted]]:bg-[radial-gradient(120%_75%_at_0%_0%,color-mix(in_oklch,var(--study-card-tint)_14%,transparent),transparent_64%),radial-gradient(90%_60%_at_100%_100%,color-mix(in_oklch,var(--study-card-tint)_7%,transparent),transparent_70%)]"
)

function StudyCard({
  open,
  onOpenChange,
  onOpenChangeComplete,
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
  className,
  style,
  onKeyDown,
  children,
  ...props
}: StudyCardProps) {
  const sheet = React.useRef<HTMLDivElement>(null)
  const [ownIndex, setOwnIndex] = React.useState(defaultIndex)
  const index = Math.min(Math.max(indexProp ?? ownIndex, 0), Math.max(count - 1, 0))
  const itemKey = itemKeyProp ?? index
  const [direction, setDirection] = React.useState<Direction>(1)
  const hasPrev = count > 1 && (loop || index > 0)
  const hasNext = count > 1 && (loop || index < count - 1)

  const step = React.useCallback((target: number, way: Direction) => {
    if (count < 1) return
    const next = loop ? (target + count) % count : target
    if (next < 0 || next >= count || next === index) return
    // Focus inside the leaving card would be dropped with it: keep it on the sheet.
    const stage = sheet.current?.querySelector('[data-slot="study-card-stage"]')
    if (stage?.contains(document.activeElement)) {
      sheet.current?.querySelector<HTMLElement>('[data-slot="modal-title"]')?.focus({ preventScroll: true })
    }
    setDirection(way)
    setOwnIndex(next)
    onIndexChange?.(next)
  }, [count, index, loop, onIndexChange])

  const labels = React.useMemo(() => ({ ...DEFAULT_LABELS, ...labelsProp }), [labelsProp])
  const context = React.useMemo<StudyCardContextValue>(() => ({
    index,
    count,
    itemKey,
    direction,
    hasPrev,
    hasNext,
    go: (target) => step(target, target > index ? 1 : -1),
    prev: () => step(index - 1, -1),
    next: () => step(index + 1, 1),
    labels,
  }), [count, direction, hasNext, hasPrev, index, itemKey, labels, step])

  const handleKeyDown: NonNullable<typeof onKeyDown> = (event) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = event.target as Element
    // Only the card's own sheet steps: one stacked on top keeps its arrows.
    if (!event.currentTarget.contains(target) || target.closest(OWN_KEYS)) return
    if (event.key === "ArrowLeft" && hasPrev) context.prev()
    else if (event.key === "ArrowRight" && hasNext) context.next()
    else return
    event.preventDefault()
  }

  const tintStyle = tint ? { "--study-card-tint": tint } as React.CSSProperties : undefined
  return (
    <Modal open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <ModalContent
        ref={sheet}
        size={size}
        height={height}
        data-study-card=""
        onKeyDown={handleKeyDown}
        className={cn(tint && tinted, className)}
        style={typeof style === "function"
          ? (state) => ({ ...tintStyle, ...style(state) })
          : { ...tintStyle, ...style }}
        {...props}
      >
        <StudyCardContext.Provider value={context}>
          <ReducedMotionConfig>{children}</ReducedMotionConfig>
        </StudyCardContext.Provider>
      </ModalContent>
    </Modal>
  )
}

/* ------------------------------------------------------------------------ */
/* Motion                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * The step's variants, shared by everything that swaps with the card. They
 * are resolved with the direction (`custom`): what enters comes from the
 * side stepped to, what leaves goes the other way.
 */
function useStepVariants(distance: number = shift.step) {
  const reduce = useShouldReduceMotion()
  const enter = useTempoTransition(transition.panelIn)
  const leave = useTempoTransition(transition.panelOut)
  return React.useMemo(() => {
    const away = (sign: number) => ({
      opacity: 0,
      filter: blur.panel,
      transform: `translateX(${reduce ? 0 : sign * distance}px)`,
    })
    const content: Variants = {
      enter: (direction: Direction) => away(direction),
      center: {
        opacity: 1,
        filter: "blur(0px)",
        transform: "translateX(0px)",
        transition: { ...enter, staggerChildren: 0.04 },
      },
      exit: (direction: Direction) => ({ ...away(-direction), transition: leave }),
    }
    // Sections settle one after another as their card arrives.
    const section: Variants = {
      enter: { opacity: 0, y: 8 },
      center: { opacity: 1, y: 0, transition: enter },
    }
    return { content, section }
  }, [distance, enter, leave, reduce])
}

/* ------------------------------------------------------------------------ */
/* Header and pager                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The modal header with the deck's pager at the end of its toolbar, so the
 * card's own actions and the pager share one capsule in the top right.
 */
function StudyCardHeader({
  title,
  titleProps,
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
  tags?: React.ReactNode
  tagsProps?: Omit<React.ComponentProps<typeof ModalTags>, "children">
  /** Extra toolbar buttons, before the pager. */
  actions?: React.ReactNode
  /** Accessible name of the toolbar; the pager's group label by default. */
  actionsLabel?: string
  pager?: boolean
}) {
  const { count, labels, itemKey, direction } = useStudyCard()
  const { content } = useStepVariants(shift.tabs)
  const showPager = pager && count > 1
  return (
    <ModalHeader {...props}>
      <ModalTitle {...titleProps} className={cn("relative overflow-visible", titleProps?.className)}>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.span
            key={itemKey}
            data-slot="study-card-title"
            custom={direction}
            variants={content}
            initial="enter"
            animate="center"
            exit="exit"
            className="block truncate"
          >
            {title}
          </motion.span>
        </AnimatePresence>
      </ModalTitle>
      {tags ? <ModalTags {...tagsProps}>{tags}</ModalTags> : null}
      {children}
      {actions || showPager ? (
        <ModalToolbar aria-label={actionsLabel ?? labels.group}>
          {actions}
          {showPager ? <StudyCardPager className={cn(actions && "before:mx-1 before:h-4.5 before:w-px before:bg-(--ui-fill-strong)")} /> : null}
        </ModalToolbar>
      ) : null}
    </ModalHeader>
  )
}

const pagerButton = "size-8 rounded-full text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground disabled:opacity-35 dark:hover:bg-(--ui-fill-hover)"

/** Previous · position · next. The position rolls to its new value. */
function StudyCardPager({ className, ...props }: React.ComponentProps<"span">) {
  const { index, count, hasPrev, hasNext, prev, next, labels } = useStudyCard()
  const root = React.useRef<HTMLSpanElement>(null)
  // A step reaching either end disables the button under focus, which would
  // swallow the arrow keys: hand focus to the step that still works.
  React.useEffect(() => {
    const active = document.activeElement
    if (active instanceof HTMLButtonElement && active.disabled && root.current?.contains(active)) {
      root.current.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true })
    }
  }, [hasPrev, hasNext])
  if (count < 2) return null
  return (
    <span ref={root} data-slot="study-card-pager" className={cn("inline-flex items-center", className)} {...props}>
      <AnimateIcon animateOnHover asChild>
        <Button variant="ghost" size="icon" className={pagerButton} aria-label={labels.prev} title={`${labels.prev}（←）`} disabled={!hasPrev} onClick={prev}>
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
      </AnimateIcon>
      <span
        data-slot="study-card-position"
        aria-live="polite"
        aria-atomic="true"
        className="inline-flex min-w-[3.5em] items-baseline justify-center text-[0.8125rem] leading-8 font-semibold whitespace-nowrap tabular-nums"
      >
        <span className="sr-only">第 {index + 1} 张，共 {count} 张</span>
        <span aria-hidden="true" className="inline-flex items-baseline">
          <SlidingNumber number={index + 1} initiallyStable />
          <span className="mx-[0.3em] font-medium text-muted-foreground/70">/</span>
          <span className="font-medium text-muted-foreground">{count}</span>
        </span>
      </span>
      <AnimateIcon animateOnHover asChild>
        <Button variant="ghost" size="icon" className={pagerButton} aria-label={labels.next} title={`${labels.next}（→）`} disabled={!hasNext} onClick={next}>
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </AnimateIcon>
    </span>
  )
}

/* ------------------------------------------------------------------------ */
/* Stage: the card on show                                                   */
/* ------------------------------------------------------------------------ */

/** How far (px) and how straight a touch swipe must go to step. */
const SWIPE_DISTANCE = 56
const SWIPE_SLOPE = 1.6

/** A swipe that starts on content scrolling sideways (a wide formula, a table) scrolls it instead. */
function scrollsSideways(target: EventTarget | null, stage: Element) {
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
 * Holds the card on show: a ModalSplit whose children are the card's panes
 * (StudyCardAside, StudyCardMain), or one of them for a single column. A
 * step swaps the whole split, one card after the other. Touch swipes
 * sideways step; set `swipe={false}` when a card is mostly content that
 * scrolls sideways.
 */
function StudyCardStage({
  ratio,
  columns = ratio === undefined ? undefined : ratioColumns(ratio),
  swipe = true,
  className,
  children,
}: {
  /** The aside's share of the width from md up (0.2–0.8); equal halves by default. */
  ratio?: number
  /** Any grid-template-columns instead of a ratio. */
  columns?: string
  swipe?: boolean
  className?: string
  children: React.ReactNode
}) {
  const { itemKey, direction, hasPrev, hasNext, prev, next } = useStudyCard()
  const blocked = React.useRef(false)

  const onPanEnd = (event: PointerEvent, { offset }: PanInfo) => {
    if (event.pointerType !== "touch" || blocked.current) return
    if (Math.abs(offset.x) < SWIPE_DISTANCE || Math.abs(offset.x) < Math.abs(offset.y) * SWIPE_SLOPE) return
    if (offset.x < 0 && hasNext) next()
    else if (offset.x > 0 && hasPrev) prev()
  }

  return (
    <motion.div
      data-slot="study-card-stage"
      // Sideways drags step cards; vertical ones still scroll, and dismiss the sheet from the top.
      data-base-ui-swipe-ignore={swipe ? "x" : undefined}
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", swipe && "touch-pan-y", className)}
      onPanStart={swipe ? (event) => { blocked.current = scrollsSideways(event.target, event.currentTarget as Element) } : undefined}
      onPanEnd={swipe ? onPanEnd : undefined}
    >
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        {/* Carries the step to the panes' content; the panes themselves stay put. */}
        <motion.div key={itemKey} initial="enter" animate="center" exit="exit" className="contents">
          <ModalSplit columns={columns}>{children}</ModalSplit>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

/* ------------------------------------------------------------------------ */
/* Card regions                                                              */
/* ------------------------------------------------------------------------ */

type RegionProps = Omit<React.ComponentProps<typeof ModalPane>, "tone">

function Region({ tone, region, className, children, ...props }: RegionProps & { tone?: "muted"; region: "aside" | "main" }) {
  const { direction } = useStudyCard()
  const { content } = useStepVariants()
  return (
    <ModalPane tone={tone} data-study-card-region={region} {...props}>
      <motion.div
        data-slot="study-card-content"
        custom={direction}
        variants={content}
        className={cn("flex flex-col gap-5.5 md:gap-6.5", className)}
      >
        {children}
      </motion.div>
    </ModalPane>
  )
}

/** The card's own pane: left from md up, first on phones, on the card's tone. */
function StudyCardAside(props: RegionProps) {
  return <Region tone="muted" region="aside" {...props} />
}

/** The long part of the card: right from md up, below the aside on phones. */
function StudyCardMain(props: RegionProps) {
  return <Region region="main" {...props} />
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
    <div data-slot="study-card-hero" className={className} {...props}>
      <div className="flex items-start justify-between gap-x-3.5 gap-y-2">
        <span
          {...titleProps}
          className={cn("min-w-0 text-[clamp(2rem,1.6rem+1.4vw,2.75rem)] leading-[1.05] font-bold tracking-tight wrap-anywhere", titleProps?.className)}
        >
          {title}
        </span>
        {badge ? <span className="mt-2 shrink-0">{badge}</span> : null}
      </div>
      {subtitle ? <div className="mt-2 text-[1.0625rem] font-medium text-muted-foreground">{subtitle}</div> : null}
      {children}
    </div>
  )
}

/** A labelled block of a card: a small label, an optional note or action on the right, then the body. */
function StudyCardSection({
  label,
  meta,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof motion.section>, "children"> & {
  label?: React.ReactNode
  meta?: React.ReactNode
  children?: React.ReactNode
}) {
  const labelId = React.useId()
  const { section } = useStepVariants()
  return (
    <motion.section
      data-slot="study-card-section"
      aria-labelledby={label && !props["aria-label"] ? labelId : undefined}
      variants={section}
      className={cn("flex min-w-0 flex-col gap-3", className)}
      {...props}
    >
      {label || meta ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[0.78rem] leading-snug text-muted-foreground">
          {label ? <span id={labelId} className="font-semibold tracking-[0.08em]">{label}</span> : null}
          {meta ? <span className="font-medium tracking-wide tabular-nums">{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </motion.section>
  )
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
  useStudyCard,
}
export type { StudyCardLabels, StudyCardProps }
