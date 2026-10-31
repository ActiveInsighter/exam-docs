export function flanking(before: string, after: string): { open: boolean; close: boolean };
export function fixStrongEmphasis(source: string): {
  text: string;
  changes: { line: number; before: string; after: string }[];
};
