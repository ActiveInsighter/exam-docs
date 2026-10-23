"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ChevronLeftIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
 *     <ModalContent size="lg">
 *       <ModalHeader>
 *         <ModalTitle /> <ModalTags /> <ModalToolbar />
 *       </ModalHeader>
 *       <ModalBody /> | <ModalSplit><ModalPane /><ModalPane /></ModalSplit>
 *       <ModalFooter />
 *     </ModalContent>
 *   </Modal>
 *
 * Phones get a bottom sheet dragged down by its header; wider screens a
 * centred panel (or a sheet with placement="sheet"). The header floats over
 * the content and turns to frosted glass, fading out at its lower edge, once
 * the content scrolls under it.
 *
 * A <Modal> rendered inside another's content is a level of a stack: the one
 * below scales back and dims, the new one gets a back button, Esc and the
 * backdrop return one level, and the close button (or useModal().closeAll)
 * closes every level. Motion and stacking live in styles/modal.css.
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
}

const ModalLevelContext = React.createContext<ModalLevel | null>(null)

/** The modal level the caller is rendered in, or null outside any modal. */
function useModal() {
  return React.useContext(ModalLevelContext)
}

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
    () => ({ depth: parent ? parent.depth + 1 : 0, open, close, closeAll, skipFocus }),
    [parent, open, close, closeAll]
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
}

const ModalSurfaceContext = React.createContext<ModalSurface | null>(null)

const WIDE_SCREEN = "(min-width: 48rem)"

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
 * Drag-to-dismiss for sheets. The popup follows the pointer from the
 * header; letting go far enough down (or with a quick flick) closes it,
 * otherwise it springs back on the stylesheet's curve. Drags that start on
 * a control are left to the control.
 */
function useSwipeDismiss(
  popup: React.RefObject<HTMLElement | null>,
  backdrop: React.RefObject<HTMLElement | null>,
  placement: ModalPlacement,
  close: () => void
) {
  const drag = React.useRef<Drag | null>(null)

  const onPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const element = popup.current
    if (!element || event.button !== 0) return
    if (placement === "center" && window.matchMedia(WIDE_SCREEN).matches) return
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
  }, [backdrop, placement, popup])

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

/** Marks the popup while any of its scroll areas has left the top. */
function trackScroll(popup: HTMLElement) {
  let frame = 0
  const update = () => {
    frame = 0
    const scrolled = Array.from(popup.querySelectorAll<HTMLElement>("[data-modal-scroll]"))
      .some((area) => area.scrollTop > 1)
    popup.toggleAttribute("data-scrolled", scrolled)
  }
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  popup.addEventListener("scroll", onScroll, { capture: true, passive: true })
  return () => {
    popup.removeEventListener("scroll", onScroll, { capture: true })
    cancelAnimationFrame(frame)
  }
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

type ModalPlacement = "center" | "sheet"
type FocusTarget = DialogPrimitive.Popup.Props["finalFocus"]
type CloseType = Parameters<Extract<FocusTarget, (...args: never[]) => unknown>>[0]

function ModalContent({
  size = "md",
  placement = "center",
  className,
  backdropClassName,
  initialFocus,
  finalFocus,
  style,
  ref,
  children,
  ...props
}: DialogPrimitive.Popup.Props & {
  /** Width on wide screens: sm 26rem, md 34rem, lg 48rem, xl 72rem, full. */
  size?: "sm" | "md" | "lg" | "xl" | "full"
  /** Wide screens only; phones always get a bottom sheet. */
  placement?: ModalPlacement
  backdropClassName?: string
}) {
  const level = useModal()
  if (!level) throw new Error("<ModalContent> must be rendered inside <Modal>.")
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  const backdropRef = React.useRef<HTMLDivElement | null>(null)
  const titleRef = React.useRef<HTMLElement | null>(null)
  const dragHandlers = useSwipeDismiss(popupRef, backdropRef, placement, level.close)
  const surface = React.useMemo(() => ({ titleRef, dragHandlers }), [dragHandlers])

  // The popup mounts and unmounts with the open state, so set up on the node.
  const setPopup = React.useCallback((node: HTMLDivElement | null) => {
    popupRef.current = node
    assignRef(ref, node)
    if (!node) return
    const untrack = trackScroll(node)
    return () => {
      untrack()
      popupRef.current = null
      assignRef(ref, null)
    }
  }, [ref])

  const { skipFocus } = level
  const resolveFinalFocus = React.useCallback((closeType: CloseType) => {
    if (skipFocus.current) return false
    if (typeof finalFocus === "function") return finalFocus(closeType)
    if (finalFocus && typeof finalFocus === "object") return finalFocus.current ?? true
    return finalFocus ?? true
  }, [finalFocus, skipFocus])

  const depthStyle = { "--modal-depth": level.depth } as React.CSSProperties
  return (
    <DialogPortal>
      {level.depth === 0 ? (
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
        data-placement={placement}
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

/* ------------------------------------------------------------------------ */
/* Header: handle, back, title, tags, toolbar, close                         */
/* ------------------------------------------------------------------------ */

const headerButton =
  "size-8 shrink-0 rounded-full bg-(--ui-fill) text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground"

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

  // The content scrolls under the header, so it is padded by its height.
  React.useLayoutEffect(() => {
    const header = headerRef.current
    const popup = header?.closest<HTMLElement>('[data-slot="modal-content"]')
    if (!header || !popup) return
    const update = () => popup.style.setProperty("--modal-header-h", `${header.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

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

/** Capsules beside the title; a scrolling row of their own on phones. */
function ModalTags({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="modal-tags" className={className} {...props} />
}

/** Actions before the close button. */
function ModalToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="modal-toolbar" className={className} {...props} />
}

/** Returns to the level below. Rendered by ModalHeader on nested levels. */
function ModalBack({ className, ...props }: Omit<DialogPrimitive.Close.Props, "render">) {
  return (
    <DialogClose
      data-slot="modal-back"
      render={<Button variant="ghost" size="icon" className={cn(headerButton, "-ml-1.5", className)} />}
      {...props}
    >
      <ChevronLeftIcon className="size-4.5" />
      <span className="sr-only">返回</span>
    </DialogClose>
  )
}

/** Closes the modal; on a nested level, the whole stack. */
function ModalClose({ className, ...props }: Omit<React.ComponentProps<typeof Button>, "render">) {
  const level = useModal()
  const nested = Boolean(level && level.depth > 0)
  if (nested) {
    return (
      <Button
        variant="ghost"
        size="icon"
        data-slot="modal-close"
        className={cn(headerButton, className)}
        title="全部关闭"
        onClick={() => level?.closeAll()}
        {...props}
      >
        <XIcon />
        <span className="sr-only">全部关闭</span>
      </Button>
    )
  }
  return (
    <DialogClose
      data-slot="modal-close"
      render={<Button variant="ghost" size="icon" className={cn(headerButton, className)} {...props} />}
    >
      <XIcon />
      <span className="sr-only">关闭</span>
    </DialogClose>
  )
}

/* ------------------------------------------------------------------------ */
/* Content areas                                                             */
/* ------------------------------------------------------------------------ */

/** One scrolling content area under the header. */
function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="modal-body" data-modal-scroll="" className={className} {...props} />
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
  return (
    <div
      data-slot="modal-split"
      data-modal-scroll=""
      className={className}
      style={columns ? { "--modal-split-columns": columns, ...style } as React.CSSProperties : style}
      {...props}
    />
  )
}

function ModalPane({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"div"> & {
  /** "muted" sets the pane on the quieter tone, which separates panes without a rule. */
  tone?: "default" | "muted"
}) {
  return <div data-slot="modal-pane" data-modal-scroll="" data-tone={tone} className={className} {...props} />
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
  ModalTags,
  ModalTitle,
  ModalToolbar,
  ModalTrigger,
  useModal,
}
