export type AssetManifest = Record<string, { hash: string; size: number }>;

export type UploadStats = {
  fileCount: number;
  uploadedFiles: number;
  uploadedBytes: number;
  hashSeconds: number;
  totalSeconds: number;
};

export function hashAsset(contents: Buffer, filePath: string): string;
export function getAssetContentType(filePath: string): string | null;
export function buildAssetManifest(directory: string): Promise<{
  manifest: AssetManifest;
  filesByHash: Map<string, { absolutePath: string; size: number }>;
}>;
export function uploadAssets(options: {
  directory: string;
  worker: string;
  accountId: string;
  apiToken: string;
  concurrency?: number;
  log?: (message: string) => void;
}): Promise<UploadStats>;
