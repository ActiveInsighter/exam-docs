export const CLOUDFLARE_DYNAMIC_REDIRECT_LIMIT: 100;
export interface StaticRewrite {
  source: string;
  destination: string;
}
export function buildCloudflareRedirects(rewrites: StaticRewrite[]): string;
export const SPECULATION_RULES_PATH: string;
export function buildSpeculationRules(): string;
export function buildCloudflareHeaders(): string;
export function buildCloudflareAssetsIgnore(): string;
export function prepareCloudflareStaticAssets(outputRoot?: string): Promise<void>;
