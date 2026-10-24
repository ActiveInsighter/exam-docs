"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
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
 * Pages. A <Modal> rendered inside another's content does not open a second
 * sheet: it is a page of the same panel, pushed in from the right while the
 * page it was opened from eases left and dims, like navigating in an app. The
 * panel keeps its width and never shrinks under a pushed page (it grows when
 * the page needs more room), morphing its height on every step. A pushed
 * page gets a back button on the left of its header; the back button and Esc
 * return one page, and the close button, the backdrop or a drag down close
 * the whole panel (as does useModal().closeAll). Each page keeps its state
 * and scroll position while covered, and focus returns to the control that
 * opened the page. Motion lives in styles/modal.css.
 */

type ModalLevel = {
  /** 0 for the modal itself, 1 for a page opened from it, and so on. */
  depth: number
  /** This level is open (and every level below it). */
  open: boolean
  /** The modal itself is open; false while it closes. */
  rootOpen: boolean
  /** Closes this level: the modal on the top level, back to the page below on a nested one. */
  close: () => void
  /**
   * Closes the modal with every page in it. Focus returns to the trigger
   * unless `returnFocus` is false (say, when a link inside navigates away).
   */
  closeAll: (options?: { returnFocus?: boolean }) => void
  /** Opens or closes this level as its own trigger and back button do. */
  setOpen: (open: boolean) => void
  /** Shared by every level of one modal. */
  stack: ModalStack
}

const ModalLevelContext = React.createContext<ModalLevel | null>(null)

/** The modal level the caller is rendered in, or null outside any modal. */
function useModal() {
  return React.useContext(ModalLevelContext)
}

/* ------------------------------------------------------------------------ */
/* Page stack                                                                */
/* ------------------------------------------------------------------------ */

type FocusTarget = DialogPrimitive.Popup.Props["finalFocus"]
type CloseType = Parameters<Extract<FocusTarget, (...args: never[]) => unknown>>[0]
/** Where focus goes when a page closes: an element, or false to leave it. */
type ReturnFocus = HTMLElement | false | null

type ModalStack = {
  subscribe: (listener: () => void) => () => void
  /** Ids of the open pages above the first, in the order they were opened. */
  pages: () => readonly string[]
  /**
   * Registers an open page; returns the function that removes it, with
   * where focus should return to (resolved then) once the page below is
   * back in front.
   */
  push: (id: string, close: () => void) => (returnFocus?: () => ReturnFocus | undefined) => void
  /** Closes the page in front; false when only the first page is open. */
  back: () => boolean
  /**
   * Where the page that just came back to front should move focus, once: an
   * element on it, null for its title, false to leave focus, undefined when
   * no page above it closed.
   */
  takeFocus: (page: HTMLElement) => ReturnFocus | undefined
}

function createModalStack(): ModalStack {
  let order: readonly string[] = []
  const closers = new Map<string, () => void>()
  const listeners = new Set<() => void>()
  // Return targets of the pages closed since a page last came back to front.
  let pendingFocus: ReturnFocus[] = []
  const emit = () => listeners.forEach((listener) => listener())

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    pages: () => order,
    push(id, close) {
      // What had focus on the page below: usually the control that opened this one.
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      closers.set(id, close)
      order = [...order.filter((page) => page !== id), id]
      emit()
      return (returnFocus) => {
        closers.delete(id)
        if (!order.includes(id)) return
        const custom = returnFocus?.()
        pendingFocus.push(custom === undefined || custom === null ? opener : custom)
        order = order.filter((page) => page !== id)
        emit()
      }
    },
    back() {
      const front = order.at(-1)
      if (front === undefined) return false
      closers.get(front)?.()
      return true
    },
    takeFocus(page) {
      const targets = pendingFocus
      pendingFocus = []
      if (targets.length === 0) return undefined
      // Closing several pages at once: the target that is on the page now in front.
      return targets.find((target) => target === false || (target && target.isConnected && page.contains(target))) ?? null
    },
  }
}

function usePages(stack: ModalStack) {
  return React.useSyncExternalStore(stack.subscribe, stack.pages, stack.pages)
}

/* ------------------------------------------------------------------------ */
/* Root                                                                      */
/* ------------------------------------------------------------------------ */

function Modal(props: DialogPrimitive.Root.Props) {
  const parent = useModal()
  return parent ? <ModalPageLevel parent={parent} {...props} /> : <ModalRoot {...props} />
}

/** Set while closing with returnFocus: false, so focus stays where it is. */
const SkipFocusContext = React.createContext<React.RefObject<boolean> | null>(null)

function ModalRoot({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  actionsRef,
  ...props
}: DialogPrimitive.Root.Props) {
  const actions = React.useRef<DialogPrimitive.Root.Actions | null>(null)
  const skipFocus = React.useRef(false)
  const [stack] = React.useState(createModalStack)
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen

  React.useImperativeHandle(actionsRef, () => ({
    close: () => actions.current?.close(),
    unmount: () => actions.current?.unmount(),
  }), [])

  const handleOpenChange = React.useCallback<NonNullable<DialogPrimitive.Root.Props["onOpenChange"]>>(
    (next, details) => {
      // Esc steps back a page before it closes the modal.
      if (!next && details.reason === "escape-key" && stack.pages().length > 0) {
        details.cancel()
        stack.back()
        return
      }
      if (next) skipFocus.current = false
      setUncontrolledOpen(next)
      onOpenChange?.(next, details)
    },
    [onOpenChange, stack]
  )

  const close = React.useCallback(() => actions.current?.close(), [])
  const closeAll = React.useCallback((options?: { returnFocus?: boolean }) => {
    if (options?.returnFocus === false) skipFocus.current = true
    close()
  }, [close])
  const setOpen = React.useCallback((next: boolean) => {
    if (next) {
      skipFocus.current = false
      setUncontrolledOpen(true)
      onOpenChange?.(true, changeDetails("imperative-action"))
    } else {
      close()
    }
  }, [close, onOpenChange])

  const level = React.useMemo<ModalLevel>(
    () => ({ depth: 0, open, rootOpen: open, close, closeAll, setOpen, stack }),
    [open, close, closeAll, setOpen, stack]
  )

  return (
    <ModalLevelContext.Provider value={level}>
      <SkipFocusContext.Provider value={skipFocus}>
        <DialogPrimitive.Root
          data-slot="modal"
          open={open}
          onOpenChange={handleOpenChange}
          actionsRef={actions}
          {...props}
        />
      </SkipFocusContext.Provider>
    </ModalLevelContext.Provider>
  )
}

type ChangeDetails = DialogPrimitive.Root.ChangeEventDetails

/** Event details for open changes a page level makes itself (no Base UI root behind it). */
function changeDetails(reason: ChangeDetails["reason"], event?: Event): ChangeDetails {
  let canceled = false
  return {
    reason,
    event: event ?? new Event("modal"),
    cancel: () => {
      canceled = true
    },
    allowPropagation: () => {},
    get isCanceled() {
      return canceled
    },
    isPropagationAllowed: false,
    trigger: undefined,
  } as unknown as ChangeDetails
}

/**
 * A <Modal> inside another's content: a page of the same panel. It keeps its
 * own open state (controlled or not) and follows the levels below it: when
 * they close, it closes too.
 */
function ModalPageLevel({
  parent,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  actionsRef,
  children,
}: DialogPrimitive.Root.Props & { parent: ModalLevel }) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const ownOpen = openProp ?? uncontrolledOpen
  const onOpenChangeRef = React.useRef(onOpenChange)
  React.useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange
  })

  const change = React.useCallback((next: boolean, reason: ChangeDetails["reason"]) => {
    const details = changeDetails(reason)
    onOpenChangeRef.current?.(next, details)
    if (!details.isCanceled) setUncontrolledOpen(next)
  }, [])
  const setOpen = React.useCallback((next: boolean) => change(next, next ? "trigger-press" : "close-press"), [change])
  const close = React.useCallback(() => change(false, "close-press"), [change])

  React.useImperativeHandle(actionsRef, () => ({ close, unmount: close }), [close])

  // A page never outlives the level it was opened from.
  const parentOpen = parent.open
  React.useEffect(() => {
    if (!parentOpen && ownOpen) change(false, "none")
  }, [parentOpen, ownOpen, change])

  const open = ownOpen && parentOpen
  const level = React.useMemo<ModalLevel>(
    () => ({
      depth: parent.depth + 1,
      open,
      rootOpen: parent.rootOpen,
      close,
      closeAll: parent.closeAll,
      setOpen,
      stack: parent.stack,
    }),
    [parent.depth, parent.rootOpen, parent.closeAll, parent.stack, open, close, setOpen]
  )

  return (
    <ModalLevelContext.Provider value={level}>
      {typeof children === "function" ? null : children}
    </ModalLevelContext.Provider>
  )
}

/** Opens its modal; inside a modal's content, pushes its page instead. */
function ModalTrigger(props: DialogPrimitive.Trigger.Props) {
  const level = useModal()
  if (level && level.depth > 0) return <ModalPageTrigger {...props} />
  return <DialogPrimitive.Trigger data-slot="modal-trigger" {...props} />
}

function ModalPageTrigger({
  render,
  className,
  onClick,
  // Dialog-only options with no meaning for a page.
  handle: _handle,
  payload: _payload,
  nativeButton: _nativeButton,
  ...props
}: DialogPrimitive.Trigger.Props) {
  const level = useModal()!
  const state = { disabled: Boolean(props.disabled), open: level.open }
  return useRender({
    defaultTagName: "button",
    render: render as useRender.Parameters<typeof state, HTMLElement, undefined>["render"],
    state,
    props: mergeProps<"button">(
      {
        type: "button",
        "data-slot": "modal-trigger",
        "aria-expanded": level.open,
        className: typeof className === "function" ? className(state as never) : className,
        onClick: (event) => {
          onClick?.(event as never)
          if (!event.defaultPrevented) level.setOpen(true)
        },
      } as React.ComponentProps<"button">,
      props as React.ComponentProps<"button">
    ),
  })
}

/* ------------------------------------------------------------------------ */
/* Panel: popup, backdrop, pages, height and drag-to-dismiss                 */
/* ------------------------------------------------------------------------ */

type ModalPanel = {
  /** The element pages are rendered into. */
  host: HTMLElement | null
  dragHandlers: ReturnType<typeof useSwipeDismiss>
}

const ModalPanelContext = React.createContext<ModalPanel | null>(null)

type ModalSurface = {
  titleRef: React.RefObject<HTMLElement | null>
  /** Pushed pages label themselves; the first page labels the dialog. */
  nested: boolean
  titleId: string
  descriptionId: string
  setDescribed: (described: boolean) => void
  dragHandlers: ModalPanel["dragHandlers"] | undefined
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

/** Duration and curve of a page step; styles/modal.css uses the same. */
const PAGE_MS = 520
const PAGE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/*
 * The panel's height across page steps. While a page is pushed, the panel
 * holds at least the height it had (--modal-hold), so a short page does not
 * shrink it; it grows for a taller page. Each step morphs the height from
 * where it was, starting from the live height when a step interrupts another.
 */
function usePanelHeight(popup: HTMLElement | null, depth: number) {
  const last = React.useRef(0)
  const holds = React.useRef<number[]>([])
  const morph = React.useRef<Animation | null>(null)
  const shownDepth = React.useRef(depth)

  React.useLayoutEffect(() => {
    if (!popup) return
    last.current = popup.getBoundingClientRect().height
    const observer = new ResizeObserver(([entry]) => {
      last.current = entry.borderBoxSize?.[0]?.blockSize ?? popup.getBoundingClientRect().height
    })
    observer.observe(popup, { box: "border-box" })
    return () => observer.disconnect()
  }, [popup])

  React.useLayoutEffect(() => {
    if (!popup || shownDepth.current === depth) return
    const from = last.current
    if (depth > shownDepth.current) {
      while (holds.current.length < depth) holds.current.push(from)
    } else {
      holds.current.length = depth
    }
    shownDepth.current = depth
    const hold = holds.current.at(-1)
    if (hold) popup.style.setProperty("--modal-hold", `${hold}px`)
    else popup.style.removeProperty("--modal-hold")

    morph.current?.cancel()
    morph.current = null
    const to = popup.getBoundingClientRect().height
    if (!from || Math.abs(to - from) < 1 || prefersReducedMotion()) return
    morph.current = popup.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: PAGE_MS,
      easing: PAGE_EASE,
    })
  }, [popup, depth])
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

type ModalContentProps = DialogPrimitive.Popup.Props & {
  /**
   * Width cap on wide screens: sm 28rem, md 40rem, lg 56rem, xl 76rem, full.
   * A page pushed inside a modal fills the panel, so it ignores this.
   */
  size?: keyof typeof MODAL_WIDTHS
  /**
   * "auto" (default) follows the content; "fixed" or a CSS length keeps one
   * height. A pushed page ignores this and follows the panel.
   */
  height?: ModalHeight
  backdropClassName?: string
}

function ModalContent(props: ModalContentProps) {
  const level = useModal()
  if (!level) throw new Error("<ModalContent> must be rendered inside <Modal>.")
  return level.depth > 0 ? <ModalPageContent {...props} /> : <ModalRootContent {...props} />
}

function ModalRootContent({
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
}: ModalContentProps) {
  const level = useModal()!
  const skipFocus = React.useContext(SkipFocusContext)
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  const backdropRef = React.useRef<HTMLDivElement | null>(null)
  const titleRef = React.useRef<HTMLElement | null>(null)
  const [popup, setPopupNode] = React.useState<HTMLDivElement | null>(null)
  const [host, setHost] = React.useState<HTMLDivElement | null>(null)
  const dragHandlers = useSwipeDismiss(popupRef, backdropRef, level.close)
  const pages = usePages(level.stack)
  usePanelHeight(popup, pages.length)

  const setPopup = React.useCallback((node: HTMLDivElement | null) => {
    popupRef.current = node
    assignRef(ref, node)
    setPopupNode(node)
  }, [ref])

  const resolveFinalFocus = React.useCallback((closeType: CloseType) => {
    if (skipFocus?.current) return false
    if (typeof finalFocus === "function") return finalFocus(closeType)
    if (finalFocus && typeof finalFocus === "object") return finalFocus.current ?? true
    return finalFocus ?? true
  }, [finalFocus, skipFocus])

  const panel = React.useMemo<ModalPanel>(() => ({ host, dragHandlers }), [host, dragHandlers])
  const fixedHeight = height === "auto" ? undefined : height === "fixed" ? "fixed" : "length"
  const sizeStyle = {
    "--modal-width": MODAL_WIDTHS[size],
    ...(fixedHeight === "length" ? { "--modal-height": height } : null),
  } as React.CSSProperties

  return (
    <DialogPortal>
      <DialogPrimitive.Backdrop
        ref={backdropRef}
        data-slot="modal-backdrop"
        className={backdropClassName}
      />
      <DialogPrimitive.Popup
        ref={setPopup}
        data-slot="modal-content"
        data-size={size}
        data-height={fixedHeight}
        data-paged={pages.length > 0 ? "" : undefined}
        initialFocus={initialFocus ?? (() => titleRef.current ?? true)}
        finalFocus={resolveFinalFocus}
        className={className}
        style={typeof style === "function"
          ? (state) => ({ ...sizeStyle, ...style(state) })
          : { ...sizeStyle, ...style }}
        {...props}
      >
        <ModalPanelContext.Provider value={panel}>
          <div ref={setHost} data-slot="modal-pages">
            <ModalPage depth={0} front={pages.length === 0} titleRef={titleRef}>
              {children}
            </ModalPage>
          </div>
        </ModalPanelContext.Provider>
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

/** A leaving page is dropped by its animation; this is the backstop (ms). */
const PAGE_LEAVE_TIMEOUT = 900

type PagePhase = "enter" | "exit" | null

/**
 * A page pushed onto the panel: rendered into the panel's page host, in
 * front of the page it was opened from, while open and while it slides away.
 */
function ModalPageContent({
  className,
  style,
  initialFocus,
  finalFocus,
  ref,
  children,
  // Root-only options: a page fills the panel.
  size: _size,
  height: _height,
  backdropClassName: _backdropClassName,
  render: _render,
  ...props
}: ModalContentProps) {
  const level = useModal()!
  const panel = React.useContext(ModalPanelContext)
  const id = React.useId()
  const titleRef = React.useRef<HTMLElement | null>(null)
  const pageRef = React.useRef<HTMLDivElement | null>(null)
  const { open, rootOpen, stack, close } = level

  const [present, setPresent] = React.useState(open)
  const [phase, setPhase] = React.useState<PagePhase>(open ? "enter" : null)
  const [shown, setShown] = React.useState({ open, rootOpen })
  if (shown.open !== open || shown.rootOpen !== rootOpen) {
    setShown({ open, rootOpen })
    if (open && !shown.open) {
      setPresent(true)
      setPhase("enter")
    } else if (!open && shown.open && rootOpen) {
      setPhase("exit")
    } else if (rootOpen && !shown.rootOpen && !open) {
      // Reopened before the panel finished closing: start from the first page.
      setPresent(false)
      setPhase(null)
    }
    // Closing with the whole panel: the page stays as it is while the panel slides away.
  }

  // In the stack while open, and while the panel closes around it.
  const registered = open || (present && !rootOpen)
  const finalFocusRef = React.useRef(finalFocus)
  React.useLayoutEffect(() => {
    finalFocusRef.current = finalFocus
  })
  React.useLayoutEffect(() => {
    if (!registered) return
    const remove = stack.push(id, close)
    return () => remove(() => resolvePageFocus(finalFocusRef.current))
  }, [registered, stack, id, close])

  React.useEffect(() => {
    if (phase !== "exit") return
    const timer = window.setTimeout(() => {
      setPresent(false)
      setPhase(null)
    }, PAGE_LEAVE_TIMEOUT)
    return () => window.clearTimeout(timer)
  }, [phase])

  const pages = usePages(stack)
  const position = pages.indexOf(id)
  const front = position >= 0 && position === pages.length - 1 && phase !== "exit"
  const covered = position >= 0 && position < pages.length - 1

  const focusOnFront = React.useCallback(() => {
    const target = typeof initialFocus === "function"
      ? initialFocus("keyboard" as never)
      : initialFocus && typeof initialFocus === "object"
        ? initialFocus.current
        : initialFocus
    if (target === false) return null
    return target instanceof HTMLElement ? target : titleRef.current ?? pageRef.current
  }, [initialFocus])

  const setPage = React.useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node
    assignRef(ref, node)
  }, [ref])

  if (!present || !panel?.host) return null
  return createPortal(
    <ModalPage
      ref={setPage}
      depth={level.depth}
      front={front}
      covered={covered}
      phase={phase}
      titleRef={titleRef}
      focusOnFront={focusOnFront}
      className={typeof className === "function" ? undefined : className}
      style={typeof style === "function" ? undefined : style}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return
        if (phase === "exit") {
          setPresent(false)
          setPhase(null)
        } else if (phase === "enter") {
          setPhase(null)
        }
      }}
      {...(props as React.ComponentProps<"div">)}
    >
      {children as React.ReactNode}
    </ModalPage>,
    panel.host
  )
}

function resolvePageFocus(finalFocus: ModalContentProps["finalFocus"]): ReturnFocus | undefined {
  if (finalFocus === undefined || finalFocus === true) return undefined
  if (finalFocus === false) return false
  const target = typeof finalFocus === "function" ? finalFocus("keyboard" as never) : finalFocus.current
  if (target === false) return false
  return target instanceof HTMLElement ? target : undefined
}

/**
 * Marks the page while any of its scroll areas has left the top
 * (data-scrolled) and, for split panes stacked on phones, with the tone of
 * the pane under the header (data-under-tone): the faded top edge shows the
 * page beneath, which takes that tone. Only attributes on the page change.
 */
function trackScroll(page: HTMLElement) {
  let frame = 0
  const live = (element: HTMLElement) => {
    const blocked = element.closest("[inert]")
    return !blocked || blocked === page || !page.contains(blocked)
  }
  const update = () => {
    frame = 0
    const areas = scrollAreas(page).filter(live)
    page.toggleAttribute("data-scrolled", areas.some((area) => area.scrollTop > 1))
    const split = Array.from(page.querySelectorAll<HTMLElement>('[data-slot="modal-split"]')).filter(live).at(-1)
    const header = page.querySelector<HTMLElement>('[data-slot="modal-header"]')
    let tone = "default"
    if (split && header) {
      const headerBottom = page.getBoundingClientRect().top + header.offsetHeight
      const under = Array.from(split.querySelectorAll<HTMLElement>(':scope > [data-slot="modal-pane"]'))
        .find((pane) => pane.getBoundingClientRect().bottom > headerBottom)
      tone = under?.dataset.tone ?? "default"
    }
    if (page.dataset.underTone !== tone) page.dataset.underTone = tone
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  page.addEventListener("scroll", schedule, { capture: true, passive: true })
  update()
  return {
    refresh: schedule,
    dispose: () => {
      page.removeEventListener("scroll", schedule, { capture: true })
      cancelAnimationFrame(frame)
    },
  }
}

function scrollAreas(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLElement>("[data-modal-scroll]"))
}

/**
 * One page of the panel: the modal's own content, or a pushed page. Only
 * the page in front is laid out in the flow (it sets the panel's height);
 * the others fill the panel behind it, inert, keeping their scroll.
 */
function ModalPage({
  depth,
  front,
  covered = !front,
  phase = null,
  titleRef,
  focusOnFront,
  ref,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  depth: number
  front: boolean
  covered?: boolean
  phase?: PagePhase
  titleRef: React.RefObject<HTMLElement | null>
  /** Pushed pages: what to focus once the page is in front. */
  focusOnFront?: () => HTMLElement | null
}) {
  const level = useModal()!
  const panel = React.useContext(ModalPanelContext)
  const nested = depth > 0
  const titleId = React.useId()
  const descriptionId = React.useId()
  const [described, setDescribed] = React.useState(false)
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = React.useState<string | undefined>(undefined)
  const tracker = React.useRef<ReturnType<typeof trackScroll> | null>(null)
  const refreshScroll = React.useCallback(() => tracker.current?.refresh(), [])

  const setPage = React.useCallback((element: HTMLDivElement | null) => {
    setNode(element)
    assignRef(ref, element)
  }, [ref])

  React.useLayoutEffect(() => {
    if (!node) return
    const current = trackScroll(node)
    tracker.current = current
    return () => {
      current.dispose()
      if (tracker.current === current) tracker.current = null
    }
  }, [node])

  // A pushed page takes focus once it is in front (not before: until then it is inert).
  const focused = React.useRef(false)
  React.useLayoutEffect(() => {
    if (!front || focused.current || !focusOnFront) return
    focused.current = true
    focusOnFront()?.focus({ preventScroll: true })
  }, [front, focusOnFront])

  // Covered pages keep their scroll; back in front, focus returns to what opened the page above.
  const scroll = React.useRef<number[]>([])
  const wasCovered = React.useRef(covered)
  const { stack, rootOpen } = level
  React.useLayoutEffect(() => {
    if (!node || wasCovered.current === covered) return
    wasCovered.current = covered
    const areas = scrollAreas(node)
    if (covered) {
      scroll.current = areas.map((area) => area.scrollTop)
      return
    }
    areas.forEach((area, index) => {
      const top = scroll.current[index]
      if (top !== undefined && Math.abs(area.scrollTop - top) > 1) area.scrollTop = top
    })
    tracker.current?.refresh()
    if (!rootOpen) return
    const target = stack.takeFocus(node)
    if (target === false || target === undefined) return
    const focusTarget = target ?? titleRef.current ?? node
    focusTarget.focus({ preventScroll: true })
  }, [covered, node, rootOpen, stack, titleRef])

  const surface = React.useMemo<ModalSurface>(() => ({
    titleRef,
    nested,
    titleId,
    descriptionId,
    setDescribed,
    dragHandlers: panel?.dragHandlers,
    headerHeight,
    setHeaderHeight,
    refreshScroll,
  }), [titleRef, nested, titleId, descriptionId, panel?.dragHandlers, headerHeight, refreshScroll])

  return (
    <div
      ref={setPage}
      data-slot="modal-page"
      data-depth={depth}
      data-front={front ? "" : undefined}
      data-covered={covered && !front ? "" : undefined}
      data-phase={phase ?? undefined}
      inert={!front}
      tabIndex={nested ? -1 : undefined}
      role={nested ? "group" : undefined}
      aria-labelledby={nested ? titleId : undefined}
      aria-describedby={nested && described ? descriptionId : undefined}
      {...props}
    >
      <ModalSurfaceContext.Provider value={surface}>{children}</ModalSurfaceContext.Provider>
    </div>
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
 * leads on pushed pages and the close button ends the row.
 */
function ModalHeader({
  className,
  children,
  showBack = true,
  showClose = true,
  ...props
}: React.ComponentProps<"header"> & {
  /** Show the back button on pushed pages. */
  showBack?: boolean
  showClose?: boolean
}) {
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
        {showBack && surface?.nested ? <ModalBack /> : null}
        {children}
        {showClose ? <ModalClose /> : null}
      </div>
    </header>
  )
}

const TITLE_CLASS = "text-base leading-snug font-semibold outline-none"

function ModalTitle({ className, ref, ...props }: React.ComponentProps<"h2">) {
  const surface = React.useContext(ModalSurfaceContext)
  const setTitle = React.useCallback((node: HTMLHeadingElement | null) => {
    if (surface) surface.titleRef.current = node
    assignRef(ref, node)
  }, [ref, surface])
  // A pushed page labels itself; the dialog keeps the first page's title.
  if (surface?.nested) {
    return (
      <h2
        ref={setTitle}
        id={surface.titleId}
        tabIndex={-1}
        data-slot="modal-title"
        className={cn(TITLE_CLASS, className)}
        {...props}
      />
    )
  }
  return (
    <DialogTitle
      ref={setTitle}
      tabIndex={-1}
      data-slot="modal-title"
      className={cn(TITLE_CLASS, className)}
      {...props}
    />
  )
}

function ModalDescription({ className, ...props }: React.ComponentProps<"p">) {
  const surface = React.useContext(ModalSurfaceContext)
  const nested = surface?.nested ?? false
  const setDescribed = surface?.setDescribed
  React.useLayoutEffect(() => {
    if (!nested || !setDescribed) return
    setDescribed(true)
    return () => setDescribed(false)
  }, [nested, setDescribed])
  if (nested) {
    return <p id={surface!.descriptionId} data-slot="modal-description" className={className} {...props} />
  }
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

/** Returns to the page below. Rendered by ModalHeader on pushed pages. */
function ModalBack({ className, onClick, ...props }: React.ComponentProps<"button">) {
  const level = useModal()
  return (
    <button
      type="button"
      data-slot="modal-back"
      className={className}
      title="返回"
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) level?.close()
      }}
      {...props}
    >
      <ChevronLeftIcon aria-hidden="true" />
      <span className="sr-only">返回</span>
    </button>
  )
}

/** Closes the modal, with every page pushed onto it. */
function ModalClose({ className, onClick, ...props }: React.ComponentProps<"button">) {
  const level = useModal()
  if (level && level.depth > 0) {
    return (
      <button
        type="button"
        data-slot="modal-close"
        className={className}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) level.closeAll()
        }}
        {...props}
      >
        <XIcon aria-hidden="true" />
        <span className="sr-only">关闭</span>
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
 * scrolling column on phones, and on any screen when it holds a single pane.
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
export type { ModalContentProps, ModalHeight }
