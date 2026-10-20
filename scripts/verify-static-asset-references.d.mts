export interface StaticAssetReferenceReport {
  scannedFiles: number;
  uniqueReferences: number;
  missing: { reference: string; sources: string[] }[];
}
export function findMissingStaticAssetReferences(rootDir: string): Promise<StaticAssetReferenceReport>;
