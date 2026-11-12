'use client';

import { AnimateIcon } from '@animate-ui/react/icons';
import { RippleButtonSurface as RippleButton } from '@/components/ui/ripple-button';
import { Button as AnimatedButton } from '@animate-ui/react/primitives/buttons/button';
import type { HTMLMotionProps } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  type ComponentProps,
  type ComponentType,
  createContext,
  type ReactElement,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/*
 * Motion only where the reader is.
 *
 * A long page has a hundred question cards, and every animated button or
 * icon is a Motion component with its own state and listeners: mounting
 * them all doubles the page's start-up work. So a card is "live" only once
 * it comes near the viewport. Until then its controls are plain elements
 * with the same classes, which look identical at rest; the parts below pick
 * between the two, so the components that use them are written once.
 *
 *   <QuestionCard>     the card's <section>; goes live near the viewport
 *   useLive()          true inside a live card, and anywhere outside a card
 *                      (the solution card, dialogs)
 *   <Pressable>        press feedback; only explicit option ripples spread
 *   <Animated>         Animate UI's AnimateIcon, or nothing around its child
 *   liveIcon(a, b)     an animated icon, or the Lucide icon it was drawn from
 */

const LiveContext = createContext(true);

/** Whether the caller may mount motion: near the viewport, or outside any question card. */
export function useLive() {
  return useContext(LiveContext);
}

/*
 * One observer for every card, created with the module: observers made
 * lazily in an effect have kept a navigated-away page reachable before
 * (docs/question-components.md, 性能约定). Cards are held weakly.
 */
const arrivals = new WeakMap<Element, () => void>();
const nearby = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    nearby?.unobserve(entry.target);
    arrivals.get(entry.target)?.();
    arrivals.delete(entry.target);
  }
}, { rootMargin: '75% 0px' });

const FOCUSABLE = 'button, input, textarea, select, a[href], [tabindex]';

/** The card's element. Its controls turn live the first time it comes within reach of the viewport. */
export function QuestionCard({ children, ...props }: ComponentProps<'section'>) {
  const ref = useRef<HTMLElement>(null);
  const [live, setLive] = useState(false);
  // Going live replaces the plain controls; focus inside the card moves to the control that took its place.
  const focused = useRef(-1);

  useEffect(() => {
    const card = ref.current;
    if (!card) return;
    const arrive = () => {
      const active = document.activeElement;
      focused.current = active && card.contains(active) ? Array.from(card.querySelectorAll(FOCUSABLE)).indexOf(active) : -1;
      setLive(true);
    };
    if (!nearby) {
      arrive();
      return;
    }
    arrivals.set(card, arrive);
    nearby.observe(card);
    return () => {
      nearby.unobserve(card);
      arrivals.delete(card);
    };
  }, []);

  useLayoutEffect(() => {
    if (!live || focused.current < 0) return;
    const target = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[focused.current];
    focused.current = -1;
    if (target && target !== document.activeElement) target.focus({ preventScroll: true });
  }, [live]);

  return (
    <section ref={ref} {...props}>
      <LiveContext.Provider value={live}>{children}</LiveContext.Provider>
    </section>
  );
}

type PressableProps = ComponentProps<'button'> & {
  /** Scale while pressed; Animate UI's press scale by default. */
  tapScale?: number;
  /** The ripples, when they need a layer of their own; rendered after the content by default. */
  ripples?: ReactNode;
};

/** Ordinary press feedback by default; options explicitly provide their ripple layer. */
export function Pressable({ tapScale, ripples, type = 'button', children, ...props }: PressableProps) {
  if (!useLive()) return <button type={type} {...props}>{children}</button>;
  const Surface = ripples ? RippleButton : AnimatedButton;
  return (
    <Surface type={type} tapScale={tapScale} {...(props as Omit<HTMLMotionProps<'button'>, 'children'>)}>
      {/* One child, as the primitive's types ask. */}
      <>
        {children}
        {ripples}
      </>
    </Surface>
  );
}

/**
 * AnimateIcon in a live card: pointing at (or pressing) the element plays
 * the icons inside it. Elsewhere the child is rendered as it is (with
 * `asChild`), or in a plain span.
 */
export function Animated({ asChild, className, children, ...triggers }: {
  animateOnHover?: boolean;
  animateOnTap?: boolean;
  /** Put the triggers on the child itself (a button) instead of a span around it. */
  asChild?: boolean;
  className?: string;
  children: ReactElement;
}) {
  if (!useLive()) return asChild ? children : <span className={className}>{children}</span>;
  return asChild
    ? <AnimateIcon asChild {...triggers}>{children}</AnimateIcon>
    : <AnimateIcon className={className} {...triggers}>{children}</AnimateIcon>;
}

export type LiveIconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Plays the icon: true for its own animation, "path" to draw it. */
  animate?: boolean | 'path';
  animateOnHover?: boolean;
  animateOnTap?: boolean;
  'aria-hidden'?: boolean | 'true';
  'data-icon'?: string;
};

/** An animated icon in a live card; the Lucide icon it was drawn from elsewhere. */
export function liveIcon(Still: LucideIcon, Moving: ComponentType<LiveIconProps>) {
  return function LiveIcon({ animate, animateOnHover, animateOnTap, size = 16, ...props }: LiveIconProps) {
    return useLive()
      ? <Moving size={size} animate={animate} animateOnHover={animateOnHover} animateOnTap={animateOnTap} {...props} />
      : <Still size={size} {...props} />;
  };
}

export type PressableRef = Ref<HTMLButtonElement>;
