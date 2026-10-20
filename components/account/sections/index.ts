import type { AccountMenuSection } from '../menu-section';
import { identitySection } from './identity';
import { sessionSection } from './session';

/** Register new account-menu sections here. */
export const accountMenuSections: readonly AccountMenuSection[] = [identitySection, sessionSection];
