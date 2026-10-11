import type { ActiveExamSolution } from '../exam-solution-context';

type ReadingAction =
  | { type: 'open'; id: string; evidence: readonly string[] }
  | { type: 'close' | 'replay' | 'show-evidence' | 'return'; id: string }
  | { type: 'complete'; id: string; replay: number; index: number };

/** One active solution, with an ordered evidence cursor. No answer or scoring state. */
export function readingReducer(state: ActiveExamSolution | null, action: ReadingAction): ActiveExamSolution | null {
  if (action.type === 'open') return { id: action.id, evidence: action.evidence, index: 0, replay: (state?.replay ?? 0) + 1, view: 'solution' };
  if (!state || state.id !== action.id) return state;
  switch (action.type) {
    case 'close': return null;
    case 'replay': return { ...state, index: 0, replay: state.replay + 1 };
    case 'show-evidence': return { ...state, index: 0, replay: state.replay + 1, view: 'evidence' };
    case 'return': return { ...state, view: 'solution' };
    case 'complete':
      if (state.replay !== action.replay || state.index !== action.index || state.index >= state.evidence.length) return state;
      return { ...state, index: state.index + 1 };
  }
}
