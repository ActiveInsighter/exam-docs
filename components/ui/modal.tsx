"use client"

import * as React from "react"
import { AnimateIcon } from "@animate-ui/react/icons"
import { Drawer as DrawerPrimitive } from "@animate-ui/react/primitives/base-ui/drawer"
import { cva, type VariantProps } from "class-variance-authority"
import { Button as BaseButton } from "@base-ui/react/button"
import { ReducedMotionConfig, transition } from "@animate-ui/react/utils/motion"
import { AnimatePresence, type HTMLMotionProps } from "motion/react"
import { createPortal } from "react-dom"
import { ModalPageFrame, useModalNavigation, type ModalNavigation } from "@/components/ui/modal-navigation"

import { ChevronLeftIcon } from "@/components/animate-ui/icons/chevron-left"
import { XIcon } from "@/components/animate-ui/icons/x"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
 * Modal: the site's sheet. Animate UI's Base UI Drawer underneath, so
 * opening, closing, swipe-to-dismiss, focus and nesting are the library's;
 * this file only composes its parts and styles them.
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
 * Placement. A sheet on the bottom edge: edge to edge on phones, floating
 * just above the edge and capped in width (`size`) from md up. Its height
 * follows the content or stays fixed (`height`).
 *
 * Header. A fixed row above native scrolling panes. Small translucent
 * controls stay crisp without backdrop sampling or large scrolling masks.
 *
 * Navigation. Nested Modals become pages of this same surface. One Drawer
 * owns dismissal, scroll locking and the focus trap. Covered pages stay
 * mounted and inert; the navigation module owns their motion and lifetime.
 */

type ModalContextValue = {
  /** 0 for a modal opened from the page, 1 for one opened inside it, and so on. */
  depth: number
  open: boolean
  /** A child returns to its parent page; a root closes the surface. */
  close: () => void
  /**
   * Closes the shared surface. Focus returns to the first
   * trigger unless `returnFocus` is false (say, when a link navigates away).
   */
  closeAll: (options?: { returnFocus?: boolean }) => void
}

type ModalInternals = ModalContextValue & {
  /** Shared by all pages: false while closing without moving focus. */
  returnFocus: React.RefObject<boolean>
  id: string
  titleId: string
  navigation: ModalNavigation
  surfaceOpen: boolean
  setOpen?: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
}

const ModalContext = React.createContext<ModalInternals | null>(null)

/** The modal the caller is rendered in, or null outside any modal. */
function useModal(): ModalContextValue | null {
  return React.useContext(ModalContext)
}

function useModalPart(part: string) {
  const modal = React.useContext(ModalContext)
  if (!modal) throw new Error(`<${part}> must be rendered inside <Modal>.`)
  return modal
}

/* ------------------------------------------------------------------------ */
/* Root and trigger                                                          */
/* ------------------------------------------------------------------------ */

/** False for the first commit only. */
function useMounted() {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return mounted
}

function Modal(props: DrawerPrimitive.Root.Props) {
  const parent = React.useContext(ModalContext)
  return parent ? <ModalPageRoot {...props} parent={parent} /> : <ModalRoot {...props} />
}

function ModalRoot({ open: openProp, defaultOpen = false, onOpenChange, actionsRef, ...props }: DrawerPrimitive.Root.Props) {
  const id = React.useId()
  const navigation = useModalNavigation()
  const actions = React.useRef<DrawerPrimitive.Root.Actions | null>(null)
  const returnFocus = React.useRef(true)
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen)
  const open = openProp ?? ownOpen
  const mounted = useMounted()
  React.useLayoutEffect(() => {
    if (open) returnFocus.current = true
  }, [open])
  const close = React.useCallback(() => actions.current?.close(), [])
  const closeAll = React.useCallback<ModalContextValue["closeAll"]>((options) => {
    if (options?.returnFocus === false) returnFocus.current = false
    close()
  }, [close])
  React.useImperativeHandle(actionsRef, () => ({ close, unmount: () => actions.current?.unmount() }), [close])
  const context = React.useMemo<ModalInternals>(() => ({
    id, titleId: `${id}-title`, depth: 0, open, surfaceOpen: open, close, closeAll, returnFocus, navigation,
  }), [id, open, close, closeAll, navigation])
  return (
    <ModalContext.Provider value={context}>
      <DrawerPrimitive.Root
        {...props}
        open={mounted && open}
        onOpenChange={(next, details) => {
          // Dismissal from outside or Escape goes back before closing the surface.
          if (!next && navigation.top && ["escape-key", "outside-press", "close-watcher"].includes(details.reason)) {
            details.cancel()
            navigation.top.close()
            return
          }
          onOpenChange?.(next, details)
          if (details.isCanceled) return
          if (next) returnFocus.current = true
          setOwnOpen(next)
        }}
        actionsRef={actions}
      />
    </ModalContext.Provider>
  )
}

/** Nested roots manage page state only; they never create a second Drawer. */
function ModalPageRoot({ parent, open: openProp, defaultOpen = false, onOpenChange, onOpenChangeComplete, actionsRef, children }: DrawerPrimitive.Root.Props & { parent: ModalInternals }) {
  const id = React.useId()
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen)
  const open = parent.open && (openProp ?? ownOpen)
  const changeOpen = React.useCallback((next: boolean) => {
    const details: DrawerPrimitive.Root.ChangeEventDetails = {
      reason: "imperative-action", event: new Event("modal-page-change"), trigger: undefined,
      isCanceled: false, isPropagationAllowed: false,
      cancel() { this.isCanceled = true },
      allowPropagation() { this.isPropagationAllowed = true },
      preventUnmountOnClose() {},
    }
    onOpenChange?.(next, details)
    if (!details.isCanceled) setOwnOpen(next)
  }, [onOpenChange])
  // Keep the registered action stable while callers render inline handlers.
  const change = React.useRef(changeOpen)
  React.useLayoutEffect(() => { change.current = changeOpen }, [changeOpen])
  const close = React.useCallback(() => change.current(false), [])
  React.useImperativeHandle(actionsRef, () => ({ close, unmount: close }), [close])
  React.useEffect(() => {
    if (!parent.open && (openProp ?? ownOpen)) change.current(false)
  }, [parent.open, openProp, ownOpen])
  const context = React.useMemo<ModalInternals>(() => ({
    ...parent, id, titleId: `${id}-title`, depth: parent.depth + 1, open, close, setOpen: changeOpen, onOpenChangeComplete,
  }), [parent, id, open, close, changeOpen, onOpenChangeComplete])
  return <ModalContext.Provider value={context}>{children as React.ReactNode}</ModalContext.Provider>
}

function ModalTrigger(props: DrawerPrimitive.Trigger.Props) {
  const modal = useModalPart("ModalTrigger")
  if (modal.depth === 0) return <DrawerPrimitive.Trigger data-slot="modal-trigger" {...props} />
  const { payload: _payload, handle: _handle, className, style, render, ...button } = props
  const state = { open: modal.open, disabled: props.disabled ?? false }
  return <BaseButton
    {...button}
    className={typeof className === "function" ? className(state) : className}
    style={typeof style === "function" ? style(state) : style}
    render={typeof render === "function" ? (elementProps) => render(elementProps, state) : render}
    data-slot="modal-trigger"
    aria-haspopup="dialog"
    aria-expanded={modal.open}
    onClick={(event) => {
      if (typeof props.onClick === "function") props.onClick(event)
      if (!event.defaultPrevented) modal.setOpen?.(!modal.open)
    }}
  />
}

/* ------------------------------------------------------------------------ */
/* Content: backdrop, viewport and the sheet                                 */
/* ------------------------------------------------------------------------ */

const modalContentVariants = cva(
  [
    "@container/modal group/modal relative isolate flex w-full origin-bottom flex-col overflow-hidden outline-none",
    "max-h-(--modal-cap) rounded-t-(--modal-radius) bg-(--modal-surface) text-foreground [box-shadow:var(--modal-shadow)]",
    // Phones: edge to edge. From md up: floating, capped in width.
    "[--modal-float:0px] [--modal-gutter:1.25rem]",
    "[--modal-cap:calc(100dvh_-_env(safe-area-inset-top,0px)_-_1.5rem)]",
    "md:mb-(--modal-float) md:w-[min(var(--modal-width),calc(100vw_-_2rem))] md:rounded-(--modal-radius) md:[box-shadow:var(--modal-shadow-float)]",
    "md:[--modal-float:0.75rem] md:[--modal-gutter:1.75rem]",
    "md:[--modal-cap:calc(100dvh_-_2.5rem_-_var(--modal-float))]",
    // Leaving: past the edge it floats above.
    "[--closed-transform:translate3d(0,calc(100%_+_var(--modal-float)_+_2px),0)]",
  ],
  {
    variants: {
      /** Width cap from md up; phones always use the full width. */
      size: {
        sm: "[--modal-width:28rem]",
        md: "[--modal-width:40rem]",
        lg: "[--modal-width:56rem]",
        xl: "[--modal-width:76rem]",
        full: "md:mb-0 md:h-[calc(100dvh_-_2.5rem)] md:w-screen md:rounded-b-none md:[--modal-float:0px] md:[box-shadow:var(--modal-shadow)]",
      },
      height: {
        /** Follows the content. */
        auto: "",
        /** As tall as the viewport allows. */
        fixed: "h-dvh",
        /** A CSS length (--modal-height). */
        length: "h-(--modal-height)",
      },
    },
    defaultVariants: { size: "md", height: "auto" },
  }
)

/**
 * "auto" follows the content; "fixed" takes the full height available; a CSS
 * length fixes it at that height. Either way the viewport caps it.
 */
type ModalHeight = "auto" | "fixed" | (string & {})

type ModalContentProps = Omit<DrawerPrimitive.Popup.Props, "className"> &
  Pick<VariantProps<typeof modalContentVariants>, "size"> & {
    /**
     * "auto" (default) follows the content; "fixed" or a CSS length keeps
     * one height, for content that changes in place.
     */
    height?: ModalHeight
    className?: string
    backdropClassName?: string
  }

type FocusTarget = DrawerPrimitive.Popup.Props["finalFocus"]
type CloseType = Parameters<Extract<FocusTarget, (...args: never[]) => unknown>>[0]

function resolveFocus(target: FocusTarget, closeType: CloseType) {
  if (typeof target === "function") return target(closeType)
  if (target && typeof target === "object") return target.current ?? true
  return target ?? true
}

/** The title of the sheet a part is rendered in: where focus starts. */
const ModalTitleContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null)

function ModalContent(props: ModalContentProps) {
  const modal = useModalPart("ModalContent")
  return modal.depth > 0 ? <ModalPageContent {...props} /> : <ModalRootContent {...props} />
}

function ModalPageContent({
  children, className, initialFocus, finalFocus, ref, style,
  size: _size, height: _height, backdropClassName: _backdrop,
  transition: _enter, exitTransition: _leave, render: _render,
  ...props
}: ModalContentProps) {
  const modal = useModalPart("ModalContent")
  const { host, register, top } = modal.navigation
  const titleRef = React.useRef<HTMLElement | null>(null)
  const frame = React.useRef<HTMLDivElement>(null)
  const restore = React.useRef<HTMLElement | null>(null)
  const restoreFocus = React.useEffectEvent(() => {
    const resolved = resolveFocus(finalFocus, "")
    if (resolved === false) return
    ;(resolved instanceof HTMLElement ? resolved : restore.current)?.focus({ preventScroll: true })
    restore.current = null
  })
  const initial = React.useEffectEvent(() => {
    const target = typeof initialFocus === "function" ? initialFocus("") : initialFocus
    if (target === false) return
    const element = target && typeof target === "object" && "current" in target ? target.current : target
    ;(element instanceof HTMLElement ? element : titleRef.current ?? frame.current)?.focus({ preventScroll: true })
  })
  React.useLayoutEffect(() => {
    if (!modal.open || !host) return
    restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return register({ id: modal.id, titleId: modal.titleId, depth: modal.depth, close: modal.close })
  }, [modal.open, host, register, modal.id, modal.titleId, modal.depth, modal.close])
  const active = modal.open && top?.id === modal.id
  React.useLayoutEffect(() => {
    if (active) initial()
    // Parent loses inert in the same commit before we restore its trigger.
    else if (!modal.open && modal.surfaceOpen && restore.current?.isConnected && modal.returnFocus.current) {
      const frame = requestAnimationFrame(restoreFocus)
      return () => cancelAnimationFrame(frame)
    }
  }, [active, modal.open, modal.surfaceOpen, modal.returnFocus])
  if (!host) return null
  return createPortal(
    <AnimatePresence onExitComplete={() => modal.onOpenChangeComplete?.(false)}>
      {modal.open ? (
        <ModalPageFrame key={modal.id} ref={(node) => {
          frame.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }} active={active} tabIndex={-1}
          {...props as Omit<HTMLMotionProps<"div">, "style">}
          onAnimationComplete={(definition) => {
            if (definition === "center") modal.onOpenChangeComplete?.(true)
          }}
          style={typeof style === "function" ? style({
            open: modal.open, transitionStatus: "idle", expanded: false, nested: true,
            nestedDrawerOpen: (top?.depth ?? 0) > modal.depth, nestedDrawerSwiping: false,
            swipeDirection: "down", swiping: false,
          }) : style}
          className={className} data-modal-depth={modal.depth}>
          <ModalTitleContext.Provider value={titleRef}>{children}</ModalTitleContext.Provider>
        </ModalPageFrame>
      ) : null}
    </AnimatePresence>, host
  )
}

function ModalRootContent({
  size = "md",
  height = "auto",
  className,
  backdropClassName,
  initialFocus,
  finalFocus,
  style,
  children,
  ...props
}: ModalContentProps) {
  const modal = useModalPart("ModalContent")
  const titleRef = React.useRef<HTMLElement | null>(null)
  const heightVariant = height === "auto" ? "auto" : height === "fixed" ? "fixed" : "length"
  const variables = {
    "--modal-depth": modal.depth,
    ...(heightVariant === "length" ? { "--modal-height": height } : null),
  } as React.CSSProperties

  return (
    <DrawerPrimitive.Portal data-slot="modal-portal">
      <DrawerPrimitive.Backdrop
        transition={transition.sheet}
        exitTransition={transition.dismiss}
        data-slot="modal-backdrop"
        className={cn(
          "fixed inset-0 z-50 min-h-dvh bg-(--modal-backdrop) supports-[-webkit-touch-callout:none]:absolute",
          backdropClassName
        )}
      />
      <DrawerPrimitive.Viewport
        data-slot="modal-viewport"
        className="fixed inset-0 z-50 flex items-end justify-center"
      >
        <DrawerPrimitive.Popup
          transition={transition.sheet}
          exitTransition={transition.dismiss}
          data-slot="modal-content"
          data-size={size}
          data-height={heightVariant}
          aria-labelledby={modal.navigation.top?.titleId ?? modal.titleId}
          initialFocus={initialFocus ?? (() => titleRef.current ?? true)}
          finalFocus={(closeType) => (modal.returnFocus.current ? resolveFocus(finalFocus, closeType) : false)}
          className={cn(modalContentVariants({ size, height: heightVariant }), className)}
          style={typeof style === "function"
            ? (state) => ({ ...variables, ...style(state) })
            : { ...variables, ...style }}
          {...props}
        >
          <ReducedMotionConfig>
            <ModalPageFrame root active={!modal.navigation.top}>
              <ModalTitleContext.Provider value={titleRef}>{children}</ModalTitleContext.Provider>
            </ModalPageFrame>
            <div ref={modal.navigation.setHost} data-slot="modal-page-host" className="pointer-events-none absolute inset-0" />
          </ReducedMotionConfig>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  )
}

/* ------------------------------------------------------------------------ */
/* Header: handle, back, title, tags, toolbar, close                         */
/* ------------------------------------------------------------------------ */

/** A translucent surface, a fine rim and a soft drop; no backdrop sampling. */
const glass = "[box-shadow:var(--modal-glass-shadow)]"
const glassButton = cn(
  glass,
  "size-9 shrink-0 rounded-full bg-(--modal-glass) text-muted-foreground hover:bg-(--modal-glass-hover) hover:text-foreground dark:hover:bg-(--modal-glass-hover) [&_svg:not([class*='size-'])]:size-4.5"
)

/**
 * The fixed header. Children share one row (title, tags, toolbar);
 * phones move the tags to a scrolling second row. A child page leads
 * with a back button, and the close button ends the row. Dragging the
 * header down dismisses the sheet.
 */
function ModalHeader({
  className,
  children,
  showBack = true,
  showClose = true,
  ...props
}: React.ComponentProps<"header"> & {
  /** Show the back button on a child page. */
  showBack?: boolean
  showClose?: boolean
}) {
  const modal = useModalPart("ModalHeader")
  const back = showBack && modal.depth > 0
  return (
    <header
      data-slot="modal-header"
      className={cn(
        "relative z-20 shrink-0 cursor-grab touch-none border-b border-(--ui-fill) bg-(--modal-surface) py-3 pr-3 pl-(--modal-gutter) select-none active:cursor-grabbing pointer-fine:py-2.5",
        back && "pl-3",
        className
      )}
      {...props}
    >
      <div
        data-slot="modal-handle"
        aria-hidden="true"
        className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-(--ui-fill-strong) pointer-fine:hidden"
      />
      <div data-slot="modal-header-bar" className="flex min-h-9 cursor-auto flex-wrap items-center gap-x-2 gap-y-1.5">
        {back ? <ModalBack /> : null}
        {children}
        {showClose ? <ModalClose className="ml-auto [[data-slot=modal-toolbar]~&]:ml-0" /> : null}
      </div>
    </header>
  )
}

function ModalTitle({ className, ref, ...props }: DrawerPrimitive.Title.Props) {
  const titleRef = React.useContext(ModalTitleContext)
  const modal = useModalPart("ModalTitle")
  return (
    <DrawerPrimitive.Title
      id={modal.titleId}
      ref={(node) => {
        if (titleRef) titleRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      tabIndex={-1}
      data-slot="modal-title"
      className={cn("min-w-0 flex-initial truncate text-base leading-snug font-semibold outline-none", className)}
      {...props}
    />
  )
}

function ModalDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="modal-description" className={className} {...props} />
}

/** Capsules beside the title; their own scrolling row on phones. */
function ModalTags({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-tags"
      // Sideways drags scroll the row; they never start a dismissal.
      data-base-ui-swipe-ignore="x"
      className={cn(
        "order-last -my-1.5 flex min-w-0 basis-full touch-pan-x items-center gap-1.5 overflow-x-auto py-1.5 pr-2 pl-0.5 [scrollbar-width:none] empty:hidden md:order-none md:flex-1 md:basis-0",
        "*:shrink-0 *:[box-shadow:var(--modal-glass-shadow)]",
        className
      )}
      {...props}
    />
  )
}

/** A translucent tag for ModalTags. */
function ModalTag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="modal-tag"
      className={cn(
        "inline-flex h-6.5 items-center gap-1.5 rounded-full bg-(--modal-glass) px-2.5 text-xs leading-none font-medium whitespace-nowrap text-foreground",
        className
      )}
      {...props}
    />
  )
}

/** Actions before the close button, grouped on one capsule. */
function ModalToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="modal-toolbar"
      className={cn(glass, "ml-auto flex min-h-9 items-center gap-0.5 rounded-full bg-(--modal-glass) p-0.5 empty:hidden", className)}
      {...props}
    />
  )
}

/** Returns to the parent page. Rendered by ModalHeader on a child page. */
function ModalBack({ className, onClick, ...props }: Omit<React.ComponentProps<typeof Button>, "children">) {
  const modal = useModalPart("ModalBack")
  return (
    <AnimateIcon animateOnHover asChild>
      <Button
        variant="ghost"
        size="icon-lg"
        data-slot="modal-back"
        title="返回"
        className={cn(glassButton, "text-foreground", className)}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) modal.close()
        }}
        {...props}
      >
        <ChevronLeftIcon aria-hidden="true" />
        <span className="sr-only">返回</span>
      </Button>
    </AnimateIcon>
  )
}

/** Closes the shared modal surface from any page. */
function ModalClose({ className, onClick, ...props }: Omit<React.ComponentProps<typeof Button>, "children">) {
  const modal = useModalPart("ModalClose")
  const label = modal.depth > 0 ? "全部关闭" : "关闭"
  return (
    <AnimateIcon animateOnHover asChild>
      <Button
        variant="ghost"
        size="icon-lg"
        data-slot="modal-close"
        title={label}
        className={cn(glassButton, className)}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) modal.closeAll()
        }}
        {...props}
      >
        <XIcon aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </Button>
    </AnimateIcon>
  )
}

/* ------------------------------------------------------------------------ */
/* Content areas                                                             */
/* ------------------------------------------------------------------------ */

// Native scroll regions below the header: no large masks or blur layers.
// This keeps text crisp and avoids repainting entire panes during a swap.
const scrollArea = "min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pt-5 [scrollbar-width:thin]"
const padTop = "pt-5"
const padBottom = "pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))]"

/** One scrolling content area under the header. */
function ModalBody({ className, ...props }: DrawerPrimitive.Content.Props) {
  return (
    <DrawerPrimitive.Content
      data-slot="modal-body"
      className={cn(
        scrollArea, padTop, padBottom,
        "px-(--modal-gutter) has-[~[data-slot=modal-footer]]:pb-6",
        className
      )}
      {...props}
    />
  )
}

/**
 * Side-by-side panes from md up, each scrolling on its own; one scrolling
 * column on phones, and on any screen when it holds a single pane.
 */
function ModalSplit({
  className,
  columns,
  style,
  ...props
}: DrawerPrimitive.Content.Props & {
  /** grid-template-columns from md up; two equal columns by default. */
  columns?: string
}) {
  const variables = columns ? { "--modal-split-columns": columns } as React.CSSProperties : undefined
  return (
    <DrawerPrimitive.Content
      data-slot="modal-split"
      className={cn(
        scrollArea,
        "grid md:grid-cols-(--modal-split-columns,repeat(2,minmax(0,1fr))) md:grid-rows-[minmax(0,1fr)] md:overflow-hidden md:has-[>[data-slot=modal-pane]:only-child]:grid-cols-1",
        className
      )}
      style={typeof style === "function"
        ? (state) => ({ ...variables, ...style(state) })
        : { ...variables, ...style }}
      {...props}
    />
  )
}

/**
 * One pane of a ModalSplit. The tone sits on the pane and the content
 * scrolls inside it; navigation never moves or repaints the pane's colour.
 * Props, ref and className go to the scrolling element.
 */
function ModalPane({
  tone = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  /** "muted" sets the pane on the quieter tone, which separates panes without a rule. */
  tone?: "default" | "muted"
}) {
  return (
    <div
      data-slot="modal-pane"
      data-tone={tone}
      className="group/pane min-w-0 bg-(--modal-pane-background,transparent) transition-colors duration-300 data-[tone=muted]:[--modal-pane-background:var(--modal-pane-muted)] md:flex md:min-h-0 md:flex-col"
    >
      <div
        data-slot="modal-pane-scroll"
        className={cn(
          "px-(--modal-gutter) pt-5 pb-7",
          "group-last/pane:pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))]",
          "md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:scroll-pt-5 md:pt-5 md:pb-9! md:[scrollbar-width:thin]",
          className
        )}
        {...props}
      />
    </div>
  )
}

function ModalFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-footer"
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-end gap-2 px-(--modal-gutter) pt-3 pb-[calc(0.875rem_+_env(safe-area-inset-bottom,0px))]",
        className
      )}
      {...props}
    />
  )
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
  modalContentVariants,
  useModal,
}
export type { ModalContentProps, ModalHeight }
