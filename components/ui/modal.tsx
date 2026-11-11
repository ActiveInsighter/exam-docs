"use client"

import * as React from "react"
import { AnimateIcon } from "@animate-ui/react/icons"
import { Drawer as DrawerPrimitive } from "@animate-ui/react/primitives/base-ui/drawer"
import { cva, type VariantProps } from "class-variance-authority"

import { ChevronLeftIcon } from "@/components/animate-ui/icons/chevron-left"
import { XIcon } from "@/components/animate-ui/icons/x"
import { Button } from "@/components/ui/button"
import { diag } from "@/lib/diagnostics"
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
 * Header. No bar: the title and frosted-glass controls float over the
 * content, which fades out as it scrolls under them (a mask as tall as the
 * header, --modal-header-h).
 *
 * Stack. A <Modal> rendered inside another's content is a sheet of its own
 * on top of it. The sheet underneath steps back (smaller, dimmed, lifted
 * until its top edge shows above the new one) and returns as the front
 * sheet leaves or is dragged away. Esc, the back button and a press outside
 * close the front sheet; its close button closes the whole stack.
 */

type ModalContextValue = {
  /** 0 for a modal opened from the page, 1 for one opened inside it, and so on. */
  depth: number
  open: boolean
  /** Closes this modal: a stacked one returns to the modal under it. */
  close: () => void
  /**
   * Closes this modal and every modal under it. Focus returns to the first
   * trigger unless `returnFocus` is false (say, when a link navigates away).
   */
  closeAll: (options?: { returnFocus?: boolean }) => void
}

type ModalInternals = ModalContextValue & {
  /** Shared by a stack: false while closing without moving focus. */
  returnFocus: React.RefObject<boolean>
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

function Modal({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  actionsRef,
  ...props
}: DrawerPrimitive.Root.Props) {
  const parent = React.useContext(ModalContext)
  const actions = React.useRef<DrawerPrimitive.Root.Actions | null>(null)
  const ownReturnFocus = React.useRef(true)
  const returnFocus = parent?.returnFocus ?? ownReturnFocus
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen)
  const open = openProp ?? ownOpen
  // The enter transition plays on a closed → open change, so a modal that
  // mounts open (lazily, on the click that opens it) opens one commit later.
  const mounted = useMounted()

  React.useImperativeHandle(actionsRef, () => ({
    close: () => actions.current?.close(),
    unmount: () => actions.current?.unmount(),
  }), [])

  // Temporary crash diagnostics.
  React.useEffect(() => {
    if (!open) return
    diag("modal-open")
    return () => diag("modal-close")
  }, [open])

  const close = React.useCallback(() => actions.current?.close(), [])
  const parentCloseAll = parent?.closeAll
  const closeAll = React.useCallback<ModalContextValue["closeAll"]>((options) => {
    if (options?.returnFocus === false) returnFocus.current = false
    close()
    parentCloseAll?.()
  }, [close, parentCloseAll, returnFocus])

  // A stacked modal never outlives the one it was opened from.
  const orphaned = parent !== null && !parent.open && open
  React.useEffect(() => {
    if (orphaned) close()
  }, [orphaned, close])

  const depth = parent ? parent.depth + 1 : 0
  const context = React.useMemo<ModalInternals>(
    () => ({ depth, open, close, closeAll, returnFocus }),
    [depth, open, close, closeAll, returnFocus]
  )

  return (
    <ModalContext.Provider value={context}>
      <DrawerPrimitive.Root
        data-slot="modal"
        open={mounted && open}
        onOpenChange={(next, details) => {
          onOpenChange?.(next, details)
          if (details.isCanceled) return
          if (next && !parent) returnFocus.current = true
          setOwnOpen(next)
        }}
        actionsRef={actions}
        {...props}
      />
    </ModalContext.Provider>
  )
}

function ModalTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="modal-trigger" {...props} />
}

/* ------------------------------------------------------------------------ */
/* Content: backdrop, viewport and the sheet                                 */
/* ------------------------------------------------------------------------ */

const modalContentVariants = cva(
  [
    "group/modal relative isolate flex w-full origin-bottom flex-col overflow-hidden outline-none",
    "max-h-(--modal-cap) rounded-t-(--modal-radius) bg-(--modal-surface) text-foreground [box-shadow:var(--modal-shadow)]",
    // Phones stack split panes in one scroll: its faded top shows the sheet, which takes the first pane's tone.
    "max-md:has-[[data-slot=modal-pane][data-tone=muted]:first-child]:bg-(--modal-pane-muted)",
    // Phones: edge to edge. From md up: floating, capped in width.
    "[--modal-float:0px] [--modal-gutter:1.25rem] [--modal-header-h:3.5rem]",
    "[--modal-cap:calc(100dvh_-_env(safe-area-inset-top,0px)_-_1.5rem_-_var(--modal-depth,0)_*_0.75rem)]",
    "md:mb-(--modal-float) md:w-[min(var(--modal-width),calc(100vw_-_2rem))] md:rounded-(--modal-radius) md:[box-shadow:var(--modal-shadow-float)]",
    "md:[--modal-float:0.75rem] md:[--modal-gutter:1.75rem]",
    "md:[--modal-cap:calc(100dvh_-_2.5rem_-_var(--modal-float)_-_var(--modal-depth,0)_*_0.75rem)]",
    // Leaving: past the edge it floats above.
    "[--closed-transform:translate3d(0,calc(100%_+_var(--modal-float)_+_2px),0)]",
    /*
     * Stack. With sheets open on top of it (--nested-drawers), this one
     * steps back: a little smaller per sheet, and lifted until its top edge
     * shows a peek above the front sheet (not at all when it is the taller
     * one). Dragging the front sheet away (--drawer-swipe-progress) brings
     * it back in step.
     */
    "[--stack-depth:calc(var(--nested-drawers,0)_-_clamp(0,var(--drawer-swipe-progress,0),1))]",
    "[--stack-scale:max(0.84,calc(1_-_var(--stack-depth)_*_0.04))]",
    "[--stack-lift:max(0px,calc(var(--drawer-frontmost-height,0px)_+_var(--stack-depth)_*_0.875rem_-_var(--drawer-height,100dvh)_*_var(--stack-scale)))]",
    "[--translate-y:calc(var(--drawer-snap-point-offset,0px)_+_var(--drawer-swipe-movement-y,0px)_-_var(--stack-lift))]",
    "data-nested-drawer-swiping:duration-0",
    // The dim over a sheet that stepped back.
    "after:pointer-events-none after:absolute after:inset-0 after:z-40 after:bg-(--modal-stack-dim) after:opacity-0 after:transition-opacity after:duration-300 data-nested-drawer-open:after:opacity-100",
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

function ModalContent({
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
          data-slot="modal-content"
          data-size={size}
          data-height={heightVariant}
          initialFocus={initialFocus ?? (() => titleRef.current ?? true)}
          finalFocus={(closeType) => (modal.returnFocus.current ? resolveFocus(finalFocus, closeType) : false)}
          className={cn(modalContentVariants({ size, height: heightVariant }), className)}
          style={typeof style === "function"
            ? (state) => ({ ...variables, ...style(state) })
            : { ...variables, ...style }}
          {...props}
        >
          <ModalTitleContext.Provider value={titleRef}>{children}</ModalTitleContext.Provider>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  )
}

/* ------------------------------------------------------------------------ */
/* Header: handle, back, title, tags, toolbar, close                         */
/* ------------------------------------------------------------------------ */

/** Frosted glass: translucent, blurred and saturated, a light rim and a soft drop. */
const glass = "[backdrop-filter:var(--modal-glass-blur)] [box-shadow:var(--modal-glass-shadow)]"
const glassButton = cn(
  glass,
  "size-9 shrink-0 rounded-full bg-(--modal-glass) text-muted-foreground hover:bg-(--modal-glass-hover) hover:text-foreground dark:hover:bg-(--modal-glass-hover) [&_svg:not([class*='size-'])]:size-4.5"
)

/** Publishes the header's height to its sheet, where the scroll areas read it. */
function useHeaderHeight() {
  const ref = React.useRef<HTMLElement>(null)
  React.useLayoutEffect(() => {
    const header = ref.current
    const sheet = header?.closest<HTMLElement>('[data-slot="modal-content"]')
    if (!header || !sheet) return
    const publish = () => sheet.style.setProperty("--modal-header-h", `${header.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(header)
    return () => {
      observer.disconnect()
      sheet.style.removeProperty("--modal-header-h")
    }
  }, [])
  return ref
}

/**
 * The floating header. Children share one row (title, tags, toolbar);
 * phones move the tags to a scrolling second row. A stacked modal leads
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
  /** Show the back button on a stacked modal. */
  showBack?: boolean
  showClose?: boolean
}) {
  const modal = useModalPart("ModalHeader")
  const ref = useHeaderHeight()
  const back = showBack && modal.depth > 0
  return (
    <header
      ref={ref}
      data-slot="modal-header"
      className={cn(
        "absolute inset-x-0 top-0 z-20 cursor-grab touch-none py-3 pr-3 pb-2 pl-(--modal-gutter) select-none active:cursor-grabbing pointer-fine:pt-2.5",
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
  return (
    <DrawerPrimitive.Title
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

/**
 * Capsules beside the title; a scrolling row of their own on phones. Each
 * child is frosted: give it a translucent background, or use ModalTag.
 */
function ModalTags({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="modal-tags"
      // Sideways drags scroll the row; they never start a dismissal.
      data-base-ui-swipe-ignore="x"
      className={cn(
        "order-last -my-1.5 flex min-w-0 basis-full touch-pan-x items-center gap-1.5 overflow-x-auto py-1.5 pr-2 pl-0.5 [scrollbar-width:none] empty:hidden md:order-none md:flex-1 md:basis-0",
        "*:shrink-0 *:[backdrop-filter:var(--modal-glass-blur)] *:[box-shadow:var(--modal-glass-shadow)]",
        className
      )}
      {...props}
    />
  )
}

/** A frosted-glass tag for ModalTags. */
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

/** Actions before the close button, grouped on one frosted-glass capsule. */
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

/** Returns to the modal under this one. Rendered by ModalHeader on a stacked modal. */
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

/** Closes the modal; on a stacked one, the whole stack. */
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

/*
 * A scroll area starts below the header and fades its content out as it
 * passes under it, and again in the last stretch at the bottom. The mask
 * sits on the scroll box, so it stays put while the content moves through.
 */
const scrollArea = "min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pt-(--modal-header-h) [scrollbar-width:thin]"
const fadeTop = "mask-t-from-[calc(100%_-_var(--modal-header-h)_-_0.5rem)] mask-t-to-[calc(100%_-_var(--modal-header-h)_*_0.6)]"
const fadeBottom = "mask-b-from-[calc(100%_-_1.5rem)]"
const padTop = "pt-[calc(var(--modal-header-h)_+_0.25rem)]"
const padBottom = "pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))]"

/** One scrolling content area under the header. */
function ModalBody({ className, ...props }: DrawerPrimitive.Content.Props) {
  return (
    <DrawerPrimitive.Content
      data-slot="modal-body"
      className={cn(
        scrollArea, fadeTop, fadeBottom, padTop, padBottom,
        "px-(--modal-gutter) has-[~[data-slot=modal-footer]]:pb-6 has-[~[data-slot=modal-footer]]:mask-b-from-100%",
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
        scrollArea, fadeTop,
        "grid md:mask-none md:grid-cols-(--modal-split-columns,repeat(2,minmax(0,1fr))) md:grid-rows-[minmax(0,1fr)] md:overflow-hidden md:has-[>[data-slot=modal-pane]:only-child]:grid-cols-1",
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
 * scrolls inside it, so the faded top edge never fades the pane's colour.
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
          "group-first/pane:pt-[calc(var(--modal-header-h)_+_0.25rem)] group-last/pane:pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))]",
          "md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:scroll-pt-(--modal-header-h) md:pt-[calc(var(--modal-header-h)_+_0.25rem)] md:pb-9! md:[scrollbar-width:thin]",
          "md:mask-t-from-[calc(100%_-_var(--modal-header-h)_-_0.5rem)] md:mask-t-to-[calc(100%_-_var(--modal-header-h)_*_0.6)] md:mask-b-from-[calc(100%_-_1.5rem)]",
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
