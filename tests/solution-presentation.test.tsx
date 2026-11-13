// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import type { SolutionEntry } from '@/components/question/solution-deck';
import { closeSolution, finishSolutionClose, openSolution, prepareSolution, resetSolutionPresentation, useSolutionOpen, useSolutionPresentation } from '@/components/question/solution-presentation';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { resetSolutionPresentation(); document.body.replaceChildren(); });

it('retains one prepared card, freezes a dismissal, and allows reopening during exit', async () => {
  const first = { key: 'first' } as SolutionEntry;
  const second = { key: 'second' } as SolutionEntry;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Status() {
    const { entry, phase } = useSolutionPresentation();
    const firstOpen = useSolutionOpen(first.key);
    return <output>{entry?.key}:{phase}:{String(firstOpen)}</output>;
  }
  try {
    await act(async () => root.render(<Status />));
    await act(async () => prepareSolution(first));
    expect(host.textContent).toBe('first:prepared:false');
    await act(async () => prepareSolution(second));
    expect(host.textContent).toBe('second:prepared:false');
    await act(async () => openSolution(first));
    await act(async () => prepareSolution(second));
    expect(host.textContent).toBe('first:open:true');
    await act(async () => closeSolution());
    await act(async () => prepareSolution(second));
    expect(host.textContent).toBe('first:closing:false');
    await act(async () => openSolution(first));
    // A late completion from the interrupted exit must not close the new session.
    await act(async () => finishSolutionClose());
    expect(host.textContent).toBe('first:open:true');
    await act(async () => { closeSolution(); finishSolutionClose(); });
    expect(host.textContent).toBe('first:prepared:false');
    await act(async () => resetSolutionPresentation());
    expect(host.textContent).toBe(':prepared:false');
  } finally {
    await act(async () => root.unmount());
  }
});
