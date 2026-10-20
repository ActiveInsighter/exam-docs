import type { ReactNode } from 'react';
import type { AccountState } from '@/lib/account/types';

/*
 * Extension point of the account menu. A feature adds an entry by creating a
 * section file and listing it in sections/index.ts; the menu itself never
 * changes. Sections render DropdownMenu items, the menu draws the separators.
 */

export interface AccountMenuContext {
  account: AccountState;
  openSignIn(): void;
}

export interface AccountMenuSection {
  id: string;
  /** Ascending. Built-ins use 0 (identity) and 1000 (session); features go in between. */
  order: number;
  /** Who sees the section. */
  audience: 'all' | 'guest' | 'signed-in';
  render(context: AccountMenuContext): ReactNode;
}
