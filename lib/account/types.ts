/*
 * Account domain types. Nothing here depends on React or on a specific auth
 * vendor, so features can import the shape of "who is signed in" without
 * pulling in the provider.
 */

/** The minimum a feature may know about a signed-in person. */
export interface AccountIdentity {
  id: string;
  email?: string;
}

/**
 * disabled   – cloud accounts are not configured for this build
 * loading    – the stored session has not been read yet
 * guest      – nobody is signed in
 * signed-in  – a session exists
 */
export type AccountPhase = 'disabled' | 'loading' | 'guest' | 'signed-in';

export interface AccountActions {
  /** Sends a magic link (and a code when the mail template includes one). Creates the account on first use. */
  sendEmailLink(email: string): Promise<void>;
  verifyEmailCode(email: string, token: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface AccountState extends AccountActions {
  phase: AccountPhase;
  /** The live session user. */
  user: AccountIdentity | null;
  /** Last signed-in identity remembered by this browser; usable offline for local data only, never authorizes a request. */
  cachedUser: AccountIdentity | null;
  /** Failure to read or watch the session; sign-in errors are thrown by the actions instead. */
  error: string | null;
}

export function accountLabel(identity: AccountIdentity | null | undefined) {
  return identity?.email ?? identity?.id ?? '';
}

/** First letter for an avatar fallback. */
export function accountInitials(identity: AccountIdentity | null | undefined) {
  const source = (identity?.email ?? identity?.id ?? '').trim();
  return source ? source.slice(0, 1).toUpperCase() : '?';
}
