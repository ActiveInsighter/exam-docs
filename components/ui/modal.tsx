"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ChevronLeftIcon, XIcon } from "lucide-react"
import {
  DialogClose,
  DialogDescription,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/*
 * A general modal built on the shadcn Dialog parts (Base UI underneath).
 *
 *   <Modal>
 *     <ModalTrigger />
 *     <ModalContent size="lg" height="fixed">
 *       <ModalHeader>
 *         <ModalTitle /> <ModalTags><ModalTag /></ModalTags> <ModalToolbar />
 *       </ModalHeader>
 *       <ModalBody /> | <ModalSplit><ModalPane /><ModalPane /></ModalSplit>
 *       <ModalFooter />
 *     </ModalContent>
 *   </Modal>
 *
 * A sheet that slides up from the bottom edge (also when it mounts already
 * open), back down on close, and follows a downward drag on its header.
 * Phones get it edge to edge; wide screens float it just above the bottom
 * edge, centred and capped in width by size. Its height follows the content
 * by default, or stays fixed (`height`), so content that changes in place
 * does not make it jump.
 *
 * The header has no background of its own. Its controls (back, toolbar,
 * tags, close) are frosted-glass capsules, and the content scrolling under it
 * dissolves at the top edge (a mask on each scroll area), so the title stays
 * legible without a bar behind it.
 *
 * A <Modal> rendered inside another's content is a level of a stack, laid
 * out like a deck of cards: each level below steps back (narrower, dimmed)
 * and shows a strip above the one in front of it, which is at least as
 * wide. The new level gets a back button, Esc and the backdrop return one
 * level, and the close button (or useModal().closeAll) closes every level.
 * Motion and stacking live in styles/modal.css; createModalStack places the
 * levels.
 */

type ModalLevel = {
  /** 0 for a top-level modal, 1 for one opened from it, and so on. */
  depth: number
  open: boolean
  /** Closes this level, back to the one below. */
  close: () => void
  /**
   * Closes this level and every level below it. Focus returns to the
   * bottom level's trigger unless `returnFocus` is false (say, when a link
   * inside navigates away).
   */
  closeAll: (options?: { returnFocus?: boolean }) => void
  /** Set while closing with the stack, so focus returns to the bottom trigger only. */
  skipFocus: React.RefObject<boolean>
  /** Shared by every level of one stack. */
  stack: ModalStack
}

const ModalLevelContext = React.createContext<ModalLevel | null>(null)

/** The modal level the caller is rendered in, or null outside any modal. */
function useModal() {
  return React.useContext(ModalLevelContext)
}

/* ------------------------------------------------------------------------ */
/* Stack layout                                                              */
/* ------------------------------------------------------------------------ */

/** Height of the strip each level below shows above the one in front (px). */
const STACK_PEEK = 12
/** Each level back narrows by this much per side (px)… */
const STACK_INSET = 16
/** …but by no more than this fraction of its width. */
const STACK_MAX_STEP = 0.05
/** Levels further back than this fade out. */
const STACK_VISIBLE = 2

type ModalStack = {
  /** Registers the popup of an open level; returns the unregister function. */
  add: (depth: number, popup: HTMLElement) => () => void
}

/*
 * Places the levels of one stack like a deck of cards. The front level sits
 * on its bottom edge as usual. Each level behind it scales back from its
 * bottom edge and, if the one in front would hide it, rises until a
 * STACK_PEEK strip shows above it. A level never sinks: one taller than the
 * level in front simply shows more of itself.
 *
 * Writes --modal-stack-y, --modal-stack-scale and data-stacked (how many
 * levels are in front) on each popup; modal.css turns them into motion and
 * dimming. The variables are registered as non-inherited, so writing them
 * restyles the popup alone.
 */
function createModalStack(): ModalStack {
  const levels = new Map<number, HTMLElement>()
  let frame = 0
  let observer: ResizeObserver | null = null

  const clear = (popup: HTMLElement) => {
    popup.style.removeProperty("--modal-stack-y")
    popup.style.removeProperty("--modal-stack-scale")
    delete popup.dataset.stacked
  }

  const layout = () => {
    cancelAnimationFrame(frame)
    frame = 0
    const popups = [...levels.entries()].sort(([a], [b]) => a - b).map(([, popup]) => popup)
    const front = popups.at(-1)
    if (!front) return
    clear(front)
    // Wide screens float the sheets above the bottom edge; all levels share the gap.
    const floor = window.innerHeight - (Number.parseFloat(getComputedStyle(front).bottom) || 0)
    let edge = floor - front.offsetHeight
    for (let index = popups.length - 2; index >= 0; index--) {
      const popup = popups[index]
      const behind = popups.length - 1 - index
      const width = popup.offsetWidth || 1
      const scale = Math.max(0.5, 1 - behind * Math.min(STACK_MAX_STEP, (STACK_INSET * 2) / width))
      const top = floor - popup.offsetHeight * scale
      const lift = Math.min(0, edge - STACK_PEEK - top)
      popup.style.setProperty("--modal-stack-y", `${lift.toFixed(1)}px`)
      popup.style.setProperty("--modal-stack-scale", scale.toFixed(4))
      popup.dataset.stacked = behind > STACK_VISIBLE ? "hidden" : String(behind)
      edge = top + lift
    }
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(layout)
  }

  return {
    add(depth, popup) {
      levels.set(depth, popup)
      if (!observer) {
        observer = new ResizeObserver(schedule)
        window.addEventListener("resize", schedule)
      }
      observer.observe(popup)
      // Synchronously, so the level below starts moving with the new one.
      layout()
      return () => {
        if (levels.get(depth) === popup) levels.delete(depth)
        observer?.unobserve(popup)
        clear(popup)
        if (levels.size === 0) {
          observer?.disconnect()
          observer = null
          window.removeEventListener("resize", schedule)
          cancelAnimationFrame(frame)
          frame = 0
        } else {
          layout()
        }
      }
    },
  }
}

/* ------------------------------------------------------------------------ */
/* Root                                                                      */
/* ------------------------------------------------------------------------ */

function Modal({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  actionsRef,
  ...props
}: DialogPrimitive.Root.Props) {
  const parent = useModal()
  const actions = React.useRef<DialogPrimitive.Root.Actions | null>(null)
  const skipFocus = React.useRef(false)
  const [ownStack] = React.useState(() => (parent ? null : createModalStack()))
  const stack = parent?.stack ?? ownStack!
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen

  React.useImperativeHandle(actionsRef, () => ({
    close: () => actions.current?.close(),
    unmount: () => actions.current?.unmount(),
  }), [])

  const handleOpenChange = React.useCallback<NonNullable<DialogPrimitive.Root.Props["onOpenChange"]>>(
    (next, details) => {
      if (next) skipFocus.current = false
      setUncontrolledOpen(next)
      onOpenChange?.(next, details)
    },
    [onOpenChange]
  )

  const close = React.useCallback(() => actions.current?.close(), [])
  const closeParents = parent?.closeAll
  const closeAll = React.useCallback((options?: { returnFocus?: boolean }) => {
    if (closeParents) {
      skipFocus.current = true
      closeParents(options)
    } else if (options?.returnFocus === false) {
      skipFocus.current = true
    }
    close()
  }, [close, closeParents])

  // A level never outlives the one it was opened from.
  const parentOpen = parent?.open ?? true
  React.useEffect(() => {
    if (parentOpen || !open) return
    skipFocus.current = true
    close()
  }, [parentOpen, open, close])

  const level = React.useMemo<ModalLevel>(
    () => ({ depth: parent ? parent.depth + 1 : 0, open, close, closeAll, skipFocus, stack }),
    [parent, open, close, closeAll, stack]
  )

  return (
    <ModalLevelContext.Provider value={level}>
      <DialogPrimitive.Root
        data-slot="modal"
        open={open}
        onOpenChange={handleOpenChange}
        actionsRef={actions}
        {...props}
      />
    </ModalLevelContext.Provider>
  )
}

function ModalTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="modal-trigger" {...props} />
}

/* ------------------------------------------------------------------------ */
/* Surface: popup, backdrop, scroll state and drag-to-dismiss                */
/* ------------------------------------------------------------------------ */

type ModalSurface = {
  titleRef: React.RefObject<HTMLElement | null>
  dragHandlers: ReturnType<typeof useSwipeDismiss>
  /** CSS width of this level on wide screens; levels opened on top are at least as wide. */
  width: string
  /** Height of the floating header; the scroll areas start below it. */
  headerHeight: string | undefined
  setHeaderHeight: (height: string) => void
  /** Re-reads the scroll state after scroll areas mount, unmount or swap. */
  refreshScroll: () => void
}

const ModalSurfaceContext = React.createContext<ModalSurface | null>(null)

/** Fraction of the sheet height, or an absolute distance, that dismisses. */
const DISMISS_RATIO = 0.25
const DISMISS_MAX_PX = 160
/** Downward speed (px/ms) that dismisses regardless of distance. */
const FLICK_VELOCITY = 0.55

type Drag = {
  pointer: number
  startY: number
  offset: number
  lastY: number
  lastTime: number
  velocity: number
}

/*
 * Drag-to-dismiss. The popup follows the pointer from the header; letting go
 * far enough down (or with a quick flick) closes it, otherwise it springs
 * back on the stylesheet's curve. Drags that start on a control are left to
 * the control.
 */
function useSwipeDismiss(
  popup: React.RefObject<HTMLElement | null>,
  backdrop: React.RefObject<HTMLElement | null>,
  close: () => void
) {
  const drag = React.useRef<Drag | null>(null)

  const onPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const element = popup.current
    if (!element || event.button !== 0) return
    if ((event.target as Element).closest("button, a, input, textarea, select, [data-modal-no-drag]")) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointer: event.pointerId,
      startY: event.clientY,
      offset: 0,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    }
    element.style.transition = "none"
    if (backdrop.current) backdrop.current.style.transition = "none"
  }, [backdrop, popup])

  const onPointerMove = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const state = drag.current
    const element = popup.current
    if (!state || !element || event.pointerId !== state.pointer) return
    const raw = event.clientY - state.startY
    // Pulling up resists instead of detaching the sheet from the bottom.
    state.offset = raw >= 0 ? raw : raw / (1 - raw / 40) / 4
    const elapsed = event.timeStamp - state.lastTime
    if (elapsed > 0) state.velocity = (event.clientY - state.lastY) / elapsed
    state.lastY = event.clientY
    state.lastTime = event.timeStamp
    element.style.transform = `translateY(${state.offset}px)`
    // The backdrop lightens as the sheet is pulled away.
    if (backdrop.current) {
      const progress = Math.min(1, Math.max(0, state.offset / element.offsetHeight))
      backdrop.current.style.opacity = String(1 - progress * 0.9)
    }
  }, [backdrop, popup])

  const finish = React.useCallback((event: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const state = drag.current
    const element = popup.current
    if (!state || event.pointerId !== state.pointer) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!element) return
    // Hand motion back to the stylesheet transitions, so the spring-back or
    // the close runs on the same curve as opening.
    element.style.transition = ""
    if (backdrop.current) backdrop.current.style.transition = ""
    const threshold = Math.min(DISMISS_MAX_PX, element.offsetHeight * DISMISS_RATIO)
    const dismiss = !cancelled && state.offset > 8 && (state.offset > threshold || state.velocity > FLICK_VELOCITY)
    if (dismiss) {
      // The closing slide continues from the dragged position, and the
      // backdrop fades out from wherever the drag left it.
      if (backdrop.current) backdrop.current.style.opacity = "0"
      close()
    } else {
      element.style.transform = ""
      if (backdrop.current) backdrop.current.style.opacity = ""
    }
  }, [backdrop, close, popup])

  return React.useMemo(() => ({
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => finish(event, false),
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => finish(event, true),
  }), [finish, onPointerDown, onPointerMove])
}

/**
 * Marks the popup while any of its scroll areas has left the top
 * (data-scrolled) and, for split panes stacked on phones, with the tone of
 * the pane under the header (data-under-tone): the faded top edge shows the
 * popup beneath, which takes that tone. Only attributes on the popup change.
 */
function trackScroll(popup: HTMLElement) {
  let frame = 0
  const update = () => {
    frame = 0
    const areas = Array.from(popup.querySelectorAll<HTMLElement>("[data-modal-scroll]:not([inert] *)"))
    popup.toggleAttribute("data-scrolled", areas.some((area) => area.scrollTop > 1))
    const split = Array.from(popup.querySelectorAll<HTMLElement>('[data-slot="modal-split"]:not([inert])')).at(-1)
    const header = popup.querySelector<HTMLElement>('[data-slot="modal-header"]')
    let tone = "default"
    if (split && header) {
      const headerBottom = popup.getBoundingClientRect().top + header.offsetHeight
      const under = Array.from(split.querySelectorAll<HTMLElement>(':scope > [data-slot="modal-pane"]'))
        .find((pane) => pane.getBoundingClientRect().bottom > headerBottom)
      tone = under?.dataset.tone ?? "default"
    }
    if (popup.dataset.underTone !== tone) popup.dataset.underTone = tone
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  popup.addEventListener("scroll", schedule, { capture: true, passive: true })
  update()
  return {
    refresh: schedule,
    dispose: () => {
      popup.removeEventListener("scroll", schedule, { capture: true })
      cancelAnimationFrame(frame)
    },
  }
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

/** Width caps on wide screens; phones always use the full width. */
const MODAL_WIDTHS = {
  sm: "28rem",
  md: "40rem",
  lg: "56rem",
  xl: "76rem",
  full: "100vw",
} as const

/**
 * "auto" follows the content; "fixed" takes the full height available; a CSS
 * length fixes it at that height. Either way the viewport caps it.
 */
type ModalHeight = "auto" | "fixed" | (string & {})

type FocusTarget = DialogPrimitive.Popup.Props["finalFocus"]
type CloseType = Parameters<Extract<FocusTarget, (...args: never[]) => unknown>>[0]

function ModalContent({
  size = "md",
  height = "auto",
  className,
  backdropClassName,
  initialFocus,
  finalFocus,
  style,
  ref,
  children,
  ...props
}: DialogPrimitive.Popup.Props & {
  /**
   * Width cap on wide screens: sm 28rem, md 40rem, lg 56rem, xl 76rem, full.
   * A nested level is at least as wide as the level below it.
   */
  size?: keyof typeof MODAL_WIDTHS
  /** "auto" (default) follows the content; "fixed" or a CSS length keeps one height. */
  height?: ModalHeight
  backdropClassName?: string
}) {
  const level = useModal()
  if (!level) throw new Error("<ModalContent> must be rendered inside <Modal>.")
  const below = React.useContext(ModalSurfaceContext)
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  const backdropRef = React.useRef<HTMLDivElement | null>(null)
  const titleRef = React.useRef<HTMLElement | null>(null)
  const scrollRef = React.useRef<ReturnType<typeof trackScroll> | null>(null)
  const [popup, setPopupNode] = React.useState<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = React.useState<string | undefined>(undefined)
  const dragHandlers = useSwipeDismiss(popupRef, backdropRef, level.close)
  const width = below ? `max(${MODAL_WIDTHS[size]}, ${below.width})` : MODAL_WIDTHS[size]
  const refreshScroll = React.useCallback(() => scrollRef.current?.refresh(), [])
  const surface = React.useMemo<ModalSurface>(
    () => ({ titleRef, dragHandlers, width, headerHeight, setHeaderHeight, refreshScroll }),
    [dragHandlers, width, headerHeight, refreshScroll]
  )

  // The popup mounts and unmounts with the open state, so set up on the node.
  const setPopup = React.useCallback((node: HTMLDivElement | null) => {
    popupRef.current = node
    assignRef(ref, node)
    setPopupNode(node)
    if (!node) return
    const tracker = trackScroll(node)
    scrollRef.current = tracker
    return () => {
      tracker.dispose()
      if (scrollRef.current === tracker) scrollRef.current = null
      popupRef.current = null
      assignRef(ref, null)
      setPopupNode(null)
    }
  }, [ref])

  // An open level takes its place in the stack; closing hands the front back.
  const { stack, depth, open } = level
  React.useLayoutEffect(() => {
    if (!popup || !open) return
    return stack.add(depth, popup)
  }, [stack, depth, open, popup])

  const { skipFocus } = level
  const resolveFinalFocus = React.useCallback((closeType: CloseType) => {
    if (skipFocus.current) return false
    if (typeof finalFocus === "function") return finalFocus(closeType)
    if (finalFocus && typeof finalFocus === "object") return finalFocus.current ?? true
    return finalFocus ?? true
  }, [finalFocus, skipFocus])

  const fixedHeight = height === "auto" ? undefined : height === "fixed" ? "fixed" : "length"
  const depthStyle = {
    "--modal-depth": depth,
    "--modal-width": width,
    ...(fixedHeight === "length" ? { "--modal-height": height } : null),
  } as React.CSSProperties
  return (
    <DialogPortal>
      {depth === 0 ? (
        <DialogPrimitive.Backdrop
          ref={backdropRef}
          data-slot="modal-backdrop"
          className={backdropClassName}
        />
      ) : null}
      <DialogPrimitive.Popup
        ref={setPopup}
        data-slot="modal-content"
        data-size={size}
        data-height={fixedHeight}
        initialFocus={initialFocus ?? (() => titleRef.current ?? true)}
        finalFocus={resolveFinalFocus}
        className={className}
        style={typeof style === "function"
          ? (state) => ({ ...depthStyle, ...style(state) })
          : { ...depthStyle, ...style }}
        {...props}
      >
        <ModalSurfaceContext.Provider value={surface}>
          {children}
        </ModalSurfaceContext.Provider>
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

/**
 * Props every scroll area shares: the header height it starts below (as a
 * non-inherited variable on the area itself, so a change restyles the area
 * alone, not the long content inside it), and a scroll-state refresh when it
 * mounts or unmounts.
 */
function useScrollArea(style: React.CSSProperties | undefined) {
  const surface = React.useContext(ModalSurfaceContext)
  const refresh = surface?.refreshScroll
  React.useLayoutEffect(() => {
    refresh?.()
    return () => refresh?.()
  }, [refresh])
  const height = surface?.headerHeight
  return React.useMemo(
    () => (height ? { "--modal-header-h": height, ...style } as React.CSSProperties : style),
    [height, style]
  )
}

/* ------------------------------------------------------------------------ */
/* Header: handle, back, title, tags, toolbar, close                         */
/* ------------------------------------------------------------------------ */

/**
 * The floating header. Children are laid out on one row (title, tags,
 * toolbar); phones move the tags to a scrolling second row. A back button
 * leads on nested levels and the close button ends the row.
 */
function ModalHeader({
  className,
  children,
  showBack = true,
  showClose = true,
  ...props
}: React.ComponentProps<"header"> & {
  /** Show the back button on nested levels. */
  showBack?: boolean
  showClose?: boolean
}) {
  const level = useModal()
  const surface = React.useContext(ModalSurfaceContext)
  const headerRef = React.useRef<HTMLElement>(null)
  const setHeaderHeight = surface?.setHeaderHeight

  React.useLayoutEffect(() => {
    const header = headerRef.current
    if (!header || !setHeaderHeight) return
    const update = () => setHeaderHeight(`${header.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    return () => observer.disconnect()
  }, [setHeaderHeight])

  return (
    <header
      ref={headerRef}
      data-slot="modal-header"
      className={className}
      {...surface?.dragHandlers}
      {...props}
    >
      <div data-slot="modal-handle" aria-hidden="true" />
      <div data-slot="modal-header-bar">
        {showBack && level && level.depth > 0 ? <ModalBack /> : null}
        {children}
        {showClose ? <ModalClose /> : null}
      </div>
    </header>
  )
}

function ModalTitle({ className, ref, ...props }: DialogPrimitive.Title.Props) {
  const surface = React.useContext(ModalSurfaceContext)
  const setTitle = React.useCallback((node: HTMLHeadingElement | null) => {
    if (surface) surface.titleRef.current = node
    assignRef(ref, node)
  }, [ref, surface])
  return (
    <DialogTitle
      ref={setTitle}
      tabIndex={-1}
      data-slot="modal-title"
      className={cn("text-base leading-snug font-semibold outline-none", className)}
      {...props}
    />
  )
}

function ModalDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogDescription data-slot="modal-description" className={className} {...props} />
}

/**
 * Capsules beside the title; a scrolling row of their own on phones. Each
 * child is frosted: give it a translucent background, or use ModalTag.
 */
function ModalTags({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="modal-tags" className={className} {...props} />
}

/** A frosted-glass tag for ModalTags. */
function ModalTag({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="modal-tag" className={className} {...props} />
}

/** Actions before the close button, grouped on one frosted-glass capsule. */
function ModalToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="modal-toolbar" className={className} {...props} />
}

/** Returns to the level below. Rendered by ModalHeader on nested levels. */
function ModalBack({ className, ...props }: Omit<DialogPrimitive.Close.Props, "render" | "className"> & { className?: string }) {
  return (
    <DialogClose
      data-slot="modal-back"
      render={<button type="button" className={className} />}
      {...props}
    >
      <ChevronLeftIcon aria-hidden="true" />
      <span className="sr-only">返回</span>
    </DialogClose>
  )
}

/** Closes the modal; on a nested level, the whole stack. */
function ModalClose({ className, onClick, ...props }: React.ComponentProps<"button">) {
  const level = useModal()
  if (level && level.depth > 0) {
    return (
      <button
        type="button"
        data-slot="modal-close"
        className={className}
        title="全部关闭"
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) level.closeAll()
        }}
        {...props}
      >
        <XIcon aria-hidden="true" />
        <span className="sr-only">全部关闭</span>
      </button>
    )
  }
  return (
    <DialogClose
      data-slot="modal-close"
      render={<button type="button" className={className} onClick={onClick} {...props} />}
    >
      <XIcon aria-hidden="true" />
      <span className="sr-only">关闭</span>
    </DialogClose>
  )
}

/* ------------------------------------------------------------------------ */
/* Content areas                                                             */
/* ------------------------------------------------------------------------ */

/** One scrolling content area under the header. */
function ModalBody({ className, style, ...props }: React.ComponentProps<"div">) {
  const areaStyle = useScrollArea(style)
  return <div data-slot="modal-body" data-modal-scroll="" className={className} style={areaStyle} {...props} />
}

/**
 * Side-by-side panes on wide screens, each scrolling on its own; one
 * scrolling column on phones.
 */
function ModalSplit({
  className,
  columns,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  /** grid-template-columns on wide screens; two equal columns by default. */
  columns?: string
}) {
  const splitStyle = React.useMemo(
    () => (columns ? { "--modal-split-columns": columns, ...style } as React.CSSProperties : style),
    [columns, style]
  )
  const areaStyle = useScrollArea(splitStyle)
  return <div data-slot="modal-split" data-modal-scroll="" className={className} style={areaStyle} {...props} />
}

/**
 * One pane of a ModalSplit. The tone sits on the pane itself and the
 * content scrolls inside it, so the faded top edge of the content never
 * fades the pane's colour. Props, ref and className go to the scrolling
 * content element.
 */
function ModalPane({
  tone = "default",
  style,
  ...props
}: React.ComponentProps<"div"> & {
  /** "muted" sets the pane on the quieter tone, which separates panes without a rule. */
  tone?: "default" | "muted"
}) {
  const areaStyle = useScrollArea(style)
  return (
    <div data-slot="modal-pane" data-tone={tone}>
      <div data-slot="modal-pane-scroll" data-modal-scroll="" style={areaStyle} {...props} />
    </div>
  )
}

function ModalFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="modal-footer" className={className} {...props} />
}

export {
  Modal,
  ModalBack,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalPane,
  ModalSplit,
  ModalTag,
  ModalTags,
  ModalTitle,
  ModalToolbar,
  ModalTrigger,
  useModal,
}
