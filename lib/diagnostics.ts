/*
 * Milestones for the temporary crash diagnostics (components/crash-diagnostics-script.tsx).
 * A no-op unless that script enabled itself on this page.
 */
type DiagnosticsSink = (type: string, data?: unknown, urgent?: boolean) => void;

export function diag(type: string, data?: unknown, urgent = false): void {
  if (typeof window === 'undefined') return;
  // Diagnostics must never prevent an answer write or a React effect.
  try {
    (window as Window & { __examDiag?: DiagnosticsSink }).__examDiag?.(type, data, urgent);
  } catch { /* Best effort only. */ }
}
