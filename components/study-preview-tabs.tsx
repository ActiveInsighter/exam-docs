'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { Tabs } from 'fumadocs-ui/components/ui/tabs';

const narrowScreenQuery = '(max-width: 700px)';
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(narrowScreenQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const getSnapshot = () => window.matchMedia(narrowScreenQuery).matches;
const getServerSnapshot = () => false;

export function StudyPreviewTabs({ children }: { children: ReactNode }) {
  const narrowScreen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <Tabs defaultValue="math" orientation={narrowScreen ? 'horizontal' : 'vertical'} className="study-workspace">
      {children}
    </Tabs>
  );
}
