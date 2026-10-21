'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AccountMenuSection } from './menu-section';

type Registry = {
  sections: readonly AccountMenuSection[];
  register(section: AccountMenuSection): () => void;
};

const Context = createContext<Registry | null>(null);

/** Holds sections contributed by feature providers mounted below the account provider. */
export function AccountMenuRegistry({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<readonly AccountMenuSection[]>([]);
  const register = useCallback((section: AccountMenuSection) => {
    setSections((current) => [...current.filter((entry) => entry.id !== section.id), section]);
    return () => setSections((current) => current.filter((entry) => entry !== section));
  }, []);
  const value = useMemo(() => ({ sections, register }), [sections, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRegisteredAccountSections(): readonly AccountMenuSection[] {
  return useContext(Context)?.sections ?? [];
}

/** Adds a section to the account menu while the calling component is mounted. Pass a stable object. */
export function useAccountMenuSection(section: AccountMenuSection): void {
  const register = useContext(Context)?.register;
  useEffect(() => register?.(section), [register, section]);
}
