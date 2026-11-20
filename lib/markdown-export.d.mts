export function splitFrontmatter(content: string): { frontmatter: string; body: string };
export function parseFrontmatterTitle(frontmatter: string): string | null;
export function stripMdxRuntimeSyntax(body: string, options?: { format?: 'default' | 'android' }): string;
export function renderStaticMarkdown(content: string, metadata: { title: string; url: string }): Promise<string>;
export function renderAndroidMarkdown(content: string, metadata: { title: string; url: string }): Promise<string>;
