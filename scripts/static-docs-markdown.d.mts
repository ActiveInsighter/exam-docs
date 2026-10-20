export function getStaticDocsPageUrl(relativePath: string): string;
export function getStaticMarkdownOutputPath(relativePath: string): string;
export function splitFrontmatter(content: string): { frontmatter: string; body: string };
export function parseFrontmatterTitle(frontmatter: string): string | null;
export function stripMdxRuntimeSyntax(body: string): string;
export function renderStaticMarkdown(content: string, metadata: { title: string; url: string }): Promise<string>;
export function buildStaticMarkdownDocument(sourcePath: string, relativePath: string): Promise<{
  outputPath: string;
  markdown: string;
}>;
export function isStaticDocSourceFile(filePath: string): boolean;
