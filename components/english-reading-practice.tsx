import { readingExercises } from '@/content/exercises';
import { EnglishReading, type ReadingExercise } from './english-reading';

type Props =
  | { exerciseId: keyof typeof readingExercises; exercise?: never }
  | { exercise: ReadingExercise; exerciseId?: never };

/** MDX adapter: resolve named content through Next's normal module graph. */
export function EnglishReadingPractice({ exercise, exerciseId }: Props) {
  const data = exercise ?? (exerciseId ? readingExercises[exerciseId] : undefined);
  if (!data) throw new Error(`Unknown English reading exercise: ${exerciseId}`);
  return <EnglishReading exercise={data} />;
}
