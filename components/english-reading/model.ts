import type { ReadingExercise } from './types';

export interface ReadingState {
  choices: Record<string, string>;
  revealed: Record<string, boolean>;
  activeQuestionId: string | null;
  evidenceIndex: number;
  replay: number;
}

export const initialReadingState: ReadingState = {
  choices: {}, revealed: {}, activeQuestionId: null, evidenceIndex: 0, replay: 0,
};

export type ReadingAction =
  | { type: 'choose'; questionId: string; optionId: string }
  | { type: 'answer' | 'explanation'; questionId: string }
  | { type: 'replay' | 'reset' }
  | { type: 'evidence-complete'; questionId: string; replay: number; index: number; count: number };

export function readingReducer(state: ReadingState, action: ReadingAction): ReadingState {
  switch (action.type) {
    case 'choose':
      if (state.revealed[action.questionId]) return state;
      return { ...state, choices: { ...state.choices, [action.questionId]: action.optionId } };
    case 'answer':
      return { ...state, revealed: { ...state.revealed, [action.questionId]: !state.revealed[action.questionId] },
        activeQuestionId: state.activeQuestionId === action.questionId ? null : state.activeQuestionId };
    case 'explanation':
      return { ...state, revealed: { ...state.revealed, [action.questionId]: true },
        activeQuestionId: state.activeQuestionId === action.questionId ? null : action.questionId,
        evidenceIndex: 0, replay: state.replay + 1 };
    case 'replay':
      return { ...state, evidenceIndex: 0, replay: state.replay + 1 };
    case 'evidence-complete':
      if (state.activeQuestionId !== action.questionId || state.replay !== action.replay || state.evidenceIndex !== action.index) return state;
      return { ...state, evidenceIndex: Math.min(action.count, state.evidenceIndex + 1) };
    case 'reset':
      return initialReadingState;
  }
}

/** Authoring errors must be visible at build time, never silently mismark evidence. */
export function validateExercise(exercise: ReadingExercise) {
  const sentences = exercise.paragraphs.flat();
  const ids = new Set(sentences.map(sentence => sentence.id));
  if (!exercise.id || !exercise.title || !exercise.paragraphs.length || exercise.paragraphs.some(paragraph => !paragraph.length) || !exercise.questions.length) {
    throw new Error('Reading exercise requires an ID, title, nonempty paragraphs and questions.');
  }
  if (ids.size !== sentences.length || new Set(exercise.questions.map(question => question.id)).size !== exercise.questions.length) {
    throw new Error('Duplicate reading sentence or question ID.');
  }
  if (sentences.some(sentence => !sentence.id || !sentence.text.trim())) throw new Error('Reading sentence requires an ID and text.');
  for (const question of exercise.questions) {
    const options = new Set(question.options.map(option => option.id));
    if (!question.id || !question.prompt.trim() || !question.explanation.trim() || question.options.length < 2 || options.size !== question.options.length || !options.has(question.answer)) {
      throw new Error(`Invalid options or answer for reading question ${question.id}.`);
    }
    if (!question.evidence.length || new Set(question.evidence).size !== question.evidence.length || question.evidence.some(id => !ids.has(id))) {
      throw new Error(`Invalid evidence reference for reading question ${question.id}.`);
    }
  }
}
