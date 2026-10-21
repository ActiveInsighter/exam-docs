import type { ReactNode } from 'react';
import type { AccountState } from '@/lib/account/types';

/*
 * Extension point of the account menu. Built-in sections are listed in
 * sections/index.ts. A feature module contributes a section at runtime with
 * useAccountMenuSection() from inside its own provider, so the account module
 * never imports the feature. Sections render DropdownMenu items; the menu
 * draws the separators.
 */

export interface AccountMenuContext {
  account: AccountState;
  openSignIn(): void;
  /** The first feature status line (see AccountMenuSection.status), shown by the identity header. */
  status?: ReactNode;
}

export interface AccountMenuSection {
  id: string;
  /** Ascending. Built-ins use 0 (identity) and 1000 (session); features go in between. */
  order: number;
  /** Who sees the section. */
  audience: 'all' | 'guest' | 'signed-in';
  /**
   * Returns menu items. The menu content unmounts when closed, so dialogs a
   * section opens must be owned by the feature's provider, not by this element.
   */
  render(context: AccountMenuContext): ReactNode;
  /** Optional status mark drawn on the header button (e.g. a sync dot). Return an element that owns its hooks. */
  indicator?(context: AccountMenuContext): ReactNode;
  /** Optional one-line status shown under the account name. */
  status?(context: AccountMenuContext): ReactNode;
}
