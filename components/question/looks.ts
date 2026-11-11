/*
 * Class names shared by several question parts. Colours come from the tone
 * variables (--tone, --tone-ink, --tone-tint, --tone-line, --tone-soft) that
 * styles/question.css sets from data-tone / data-feedback.
 */

/** Option letters quoted outside the options ("ACD"): the marker's face, so they read as the same letters. */
export const choiceLetters = '[font-family:var(--exam-letter-font)] text-[1.15em] font-normal tracking-[0.06em] italic';

/** Small print beside a control. */
export const hint = 'text-[0.8125rem] text-muted-foreground';

/** A quiet capsule button of the card's footer. */
export const quietButton = 'h-8 gap-1.5 rounded-full px-3 text-[0.8125rem] text-muted-foreground hover:bg-(--ui-fill-hover) hover:text-foreground has-data-[icon=inline-start]:pl-2.5 aria-expanded:bg-(--ui-fill-active) aria-expanded:text-foreground dark:hover:bg-(--ui-fill-hover)';

/** A capsule that takes its tone on hover and when pressed in (self-grades, grade-all). */
export const toneButton = 'border-(--exam-line) bg-transparent text-foreground/80 [--ripple-button-ripple-color:var(--tone)] hover:border-(--tone-line) hover:bg-(--tone-tint) hover:text-(--tone-ink) aria-pressed:border-(--tone) aria-pressed:bg-(--tone-tint) aria-pressed:text-(--tone-ink) dark:border-(--exam-line) dark:bg-transparent dark:hover:bg-(--tone-tint)';
