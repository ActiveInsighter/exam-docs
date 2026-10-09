export interface ReadingSentence {
  id: string;
  text: string;
}

export interface ReadingQuestion {
  id: string;
  prompt: string;
  skill: string;
  options: readonly { id: string; text: string; explanation: string }[];
  answer: string;
  explanation: string;
  /** Sentence IDs, ordered as the evidence should be read. */
  evidence: readonly string[];
}

export interface ReadingExercise {
  /** A new exercise must have a new ID; this resets the practice session. */
  id: string;
  title: string;
  source: string;
  paragraphs: readonly (readonly ReadingSentence[])[];
  questions: readonly ReadingQuestion[];
}
