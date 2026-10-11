export type ReadingView = 'article' | 'questions';
export interface ReadingState {
  question: number;
  revealed: boolean;
  view: ReadingView;
  evidence: string | null;
  revision: number;
}
export const initialReadingState: ReadingState = { question: 0, revealed: false, view: 'article', evidence: null, revision: 0 };
type ReadingAction =
  | { type: 'question'; index: number; count: number }
  | { type: 'solution'; evidence: readonly string[] }
  | { type: 'view'; view: ReadingView }
  | { type: 'evidence'; id: string };

/** User actions are the only transitions. Animation never drives navigation. */
export function readingReducer(state: ReadingState, action: ReadingAction): ReadingState {
  switch (action.type) {
    case 'question':
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= action.count || action.index === state.question) return state;
      return { ...initialReadingState, question: action.index, view: 'questions', revision: state.revision + 1 };
    case 'solution':
      return { ...state, revealed: !state.revealed, view: 'questions', evidence: state.revealed ? null : action.evidence[0] ?? null, revision: state.revision + 1 };
    case 'view': return { ...state, view: action.view };
    case 'evidence': return { ...state, view: 'article', evidence: action.id, revision: state.revision + 1 };
  }
}
