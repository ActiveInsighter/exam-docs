/*
 * Room for the maths keypad below the content, so the last blanks can scroll
 * above it, plus keeping the focused field in view.
 *
 * The space is added to the element that scrolls the field: on desktop the
 * docs layout scrolls an inner panel, not the window, and padding <body>
 * there only gave the window a phantom scroll range while the field stayed
 * under the keypad. Releasing is deferred a moment, so moving from one blank
 * to the next (one keypad unmounts, the next mounts) never shrinks the page
 * and makes the browser clamp the scroll position.
 */

const RELEASE_DELAY_MS = 250;
/** Gap kept between the field and the keypad's top edge. */
const FIELD_GAP = 20;

type Room = { scroller: HTMLElement; previous: string; base: string; height: number };

let room: Room | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

function isScrollable(element: HTMLElement) {
  const { overflowY } = getComputedStyle(element);
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
}

/** The element that scrolls `field`: an inner panel when there is one, otherwise the page. */
export function scrollerOf(field: HTMLElement): HTMLElement {
  for (let node = field.parentElement; node && node !== document.body; node = node.parentElement) {
    if (isScrollable(node) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return document.body;
}

function apply(next: Room) {
  // The scroller's own padding stays; the keypad's height is added to it.
  next.scroller.style.paddingBottom = `calc(${next.base} + ${next.height}px)`;
}

function restore(current: Room) {
  current.scroller.style.paddingBottom = current.previous;
  delete current.scroller.dataset.keypadRoom;
}

/** Reserves `height` pixels below the content that scrolls `field`. */
export function reserveRoom(field: HTMLElement, height: number) {
  clearTimeout(releaseTimer);
  releaseTimer = undefined;
  const scroller = scrollerOf(field);
  if (room && room.scroller !== scroller) {
    restore(room);
    room = null;
  }
  if (!room) {
    room = { scroller, previous: scroller.style.paddingBottom, base: getComputedStyle(scroller).paddingBottom, height };
    scroller.dataset.keypadRoom = '';
  }
  room.height = Math.ceil(height);
  apply(room);
  document.documentElement.dataset.keypadOpen = '';
}

/** Gives the room back shortly, unless another field reserves it first. */
export function releaseRoom() {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    releaseTimer = undefined;
    if (room) restore(room);
    room = null;
    delete document.documentElement.dataset.keypadOpen;
  }, RELEASE_DELAY_MS);
}

/** Scrolls the field's scroller just enough that the field sits clear of the keypad (and below the top edge). */
export function revealField(field: HTMLElement, keypadTop: number, smooth: boolean) {
  const scroller = scrollerOf(field);
  const rect = field.getBoundingClientRect();
  const top = scroller === document.body ? 0 : Math.max(0, scroller.getBoundingClientRect().top);
  const limit = keypadTop - FIELD_GAP;
  let delta = 0;
  if (rect.bottom > limit) delta = rect.bottom - limit;
  else if (rect.top < top + FIELD_GAP) delta = rect.top - top - FIELD_GAP;
  if (Math.abs(delta) < 1) return;
  const target = scroller === document.body ? window : scroller;
  target.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
}
