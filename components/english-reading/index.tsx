import { EnglishReadingClient } from './reading-client';
import { validateExercise } from './model';
import type { ReadingExercise } from './types';

export type { ReadingExercise, ReadingQuestion, ReadingSentence } from './types';

/** Server entry point: validate authored data, then mount an isolated practice session. */
export function EnglishReading({ exercise }: { exercise: ReadingExercise }) {
  validateExercise(exercise);
  return <EnglishReadingClient key={exercise.id} exercise={exercise} />;
}
