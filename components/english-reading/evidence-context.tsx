'use client';

import { createContext, useContext } from 'react';

export const ReadingEvidenceContext = createContext<{ ids: readonly string[]; current: string | null; revision: number }>({ ids: [], current: null, revision: 0 });
export const useReadingEvidence = () => useContext(ReadingEvidenceContext);
