import { type RefObject, useEffect } from 'react';

/*
 * Eases a viewport between the heights of the content it swaps, so switching
 * from a long panel to a short one (or back) glides instead of jumping the
 * rest of the page.
 *
 *   viewport   the element that animates; it should clip its overflow
 *   content    its only child, observed at its natural height
 *   active     picks the content's current child; only a change of that
 *              child animates. Resizes within the same child (images, fonts,
 *              accordions, window width) follow instantly.
 *
 * The stylesheet owns the motion: duration and easing are read from the
 * viewport's own `transition` (a declared height transition never fires on
 * its own, because the height stays `auto`), and a zero duration, for example
 * under prefers-reduced-motion, turns the animation off.
 *
 * The animation starts inside the ResizeObserver callback, which runs after
 * layout and before paint, so the new height is never painted unanimated.
 * Switching again mid-way retargets from the height currently on screen.
 */
export function useHeightTransition(
  viewportRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  active: (content: HTMLElement) => Element | null,
) {
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    let height = content.offsetHeight;
    let child = active(content);
    let animation: Animation | undefined;

    const stop = observeHeight(content, (next) => {
      const nextChild = active(content);
      const swapped = nextChild !== child;
      // Read before cancelling: mid-animation, the viewport shows neither end.
      const from = animation ? viewport.getBoundingClientRect().height : height;
      child = nextChild;
      height = next;

      if (!swapped && !animation) return;
      animation?.cancel();
      animation = undefined;

      const { duration, easing } = transitionOf(viewport);
      if (duration <= 0 || Math.abs(from - next) < 1) return;

      const current = viewport.animate({ height: [`${from}px`, `${next}px`] }, { duration, easing });
      animation = current;
      current.onfinish = () => {
        if (animation === current) animation = undefined;
      };
    });

    return () => {
      stop();
      animation?.cancel();
    };
  }, [viewportRef, contentRef, active]);
}

function transitionOf(element: Element) {
  const style = getComputedStyle(element);
  return {
    duration: toMilliseconds(style.transitionDuration.split(',')[0]),
    easing: style.transitionTimingFunction.split(/,(?![^(]*\))/)[0].trim() || 'ease',
  };
}

function toMilliseconds(value = '0s') {
  const amount = Number.parseFloat(value) || 0;
  return value.trim().endsWith('ms') ? amount : amount * 1000;
}

/*
 * One ResizeObserver for every viewport on the page: documents with dozens of
 * tab groups share a single observer and a single callback per frame.
 */
type HeightListener = (height: number) => void;

let observer: ResizeObserver | undefined;
const listeners = new WeakMap<Element, HeightListener>();

function observeHeight(element: Element, listener: HeightListener) {
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      listeners.get(entry.target)?.(height);
    }
  });
  listeners.set(element, listener);
  observer.observe(element);

  return () => {
    listeners.delete(element);
    observer?.unobserve(element);
  };
}
