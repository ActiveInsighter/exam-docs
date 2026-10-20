'use client';

import { type PointerEvent, type RefObject, useCallback, useRef } from 'react';

/*
 * Drag-to-dismiss for the bottom sheet. The handle and header follow the
 * pointer; letting go far enough down (or with a quick flick) closes the
 * sheet, otherwise it springs back. Drags that start on a button are ignored.
 */

/** Fraction of the sheet height, or an absolute distance, that dismisses. */
const DISMISS_RATIO = 0.25;
const DISMISS_MAX_PX = 160;
/** Downward speed (px/ms) that dismisses regardless of distance. */
const FLICK_VELOCITY = 0.55;

/** The dimmed backdrop rendered beside the open sheet. */
const backdropOf = (sheet: HTMLElement) =>
  sheet.ownerDocument.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');

type Drag = { pointer: number; startY: number; offset: number; lastY: number; lastTime: number; velocity: number };

export function useSheetDrag(sheet: RefObject<HTMLElement | null>, close: () => void) {
  const drag = useRef<Drag | null>(null);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    const element = sheet.current;
    if (!element || event.button !== 0) return;
    if ((event.target as Element).closest('button, a, input')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      startY: event.clientY,
      offset: 0,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    };
    element.style.transition = 'none';
    const backdrop = backdropOf(element);
    if (backdrop) backdrop.style.transition = 'none';
  }, [sheet]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    const element = sheet.current;
    if (!state || !element || event.pointerId !== state.pointer) return;
    const raw = event.clientY - state.startY;
    // Pulling up resists instead of detaching the sheet from the bottom.
    state.offset = raw >= 0 ? raw : raw / (1 - raw / 40) / 4;
    const elapsed = event.timeStamp - state.lastTime;
    if (elapsed > 0) state.velocity = (event.clientY - state.lastY) / elapsed;
    state.lastY = event.clientY;
    state.lastTime = event.timeStamp;
    element.style.transform = `translateY(${state.offset}px)`;
    // The backdrop lightens as the sheet is pulled away.
    const backdrop = backdropOf(element);
    if (backdrop) {
      const progress = Math.min(1, Math.max(0, state.offset / element.offsetHeight));
      backdrop.style.opacity = String(1 - progress * 0.9);
    }
  }, [sheet]);

  const finish = useCallback((event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const state = drag.current;
    const element = sheet.current;
    if (!state || event.pointerId !== state.pointer) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!element) return;
    // Hand motion back to the stylesheet transitions, so the spring-back or
    // the close runs on the same curve as opening.
    element.style.transition = '';
    const backdrop = backdropOf(element);
    if (backdrop) backdrop.style.transition = '';
    const threshold = Math.min(DISMISS_MAX_PX, element.offsetHeight * DISMISS_RATIO);
    const dismiss = !cancelled && state.offset > 8 && (state.offset > threshold || state.velocity > FLICK_VELOCITY);
    if (dismiss) {
      // The closing transition continues from the dragged position, and the
      // backdrop fades out from wherever the drag left it.
      if (backdrop) backdrop.style.opacity = '0';
      close();
    } else {
      element.style.transform = '';
      if (backdrop) backdrop.style.opacity = '';
    }
  }, [close, sheet]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, false),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, true),
  };
}
